-- save_care_plan + create_successor_care_plan RPC
-- 設計参照: docs/care-plan-aggregate-design.md §7.5, §7.6

CREATE OR REPLACE FUNCTION save_care_plan(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_plan_id UUID;
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_plan JSONB;
BEGIN
  v_plan := p_payload->'plan';
  v_plan_id := (v_plan->>'id')::UUID;
  v_new_version := (v_plan->>'version')::INTEGER;

  SELECT version INTO v_current_version
  FROM care_plans WHERE id = v_plan_id;

  IF v_current_version IS NULL THEN
    INSERT INTO care_plans (
      id, tenant_id, care_recipient_id, assessment_id, plan_number,
      plan_period_from, plan_period_to, status,
      created_by, created_at, updated_at, finalized_at, version
    ) VALUES (
      v_plan_id,
      (v_plan->>'tenant_id')::UUID,
      (v_plan->>'care_recipient_id')::UUID,
      (v_plan->>'assessment_id')::UUID,
      v_plan->>'plan_number',
      (v_plan->>'plan_period_from')::DATE,
      (v_plan->>'plan_period_to')::DATE,
      v_plan->>'status',
      (v_plan->>'created_by')::UUID,
      (v_plan->>'created_at')::TIMESTAMPTZ,
      (v_plan->>'updated_at')::TIMESTAMPTZ,
      NULLIF(v_plan->>'finalized_at', '')::TIMESTAMPTZ,
      v_new_version
    );
  ELSE
    IF v_current_version != v_new_version THEN
      RAISE EXCEPTION 'version_conflict: expected %, got %',
        v_current_version, v_new_version;
    END IF;
    UPDATE care_plans
    SET status            = v_plan->>'status',
        plan_number       = v_plan->>'plan_number',
        plan_period_from  = (v_plan->>'plan_period_from')::DATE,
        plan_period_to    = (v_plan->>'plan_period_to')::DATE,
        updated_at        = (v_plan->>'updated_at')::TIMESTAMPTZ,
        finalized_at      = NULLIF(v_plan->>'finalized_at', '')::TIMESTAMPTZ,
        version           = version + 1
    WHERE id = v_plan_id;
  END IF;

  -- 子テーブルは全削除→再挿入。子 ID はペイロードから採用 (永続性契約)
  DELETE FROM care_plan_service_items WHERE care_plan_id = v_plan_id;
  DELETE FROM care_plan_short_term_goals WHERE care_plan_id = v_plan_id;
  DELETE FROM care_plan_long_term_goals WHERE care_plan_id = v_plan_id;

  INSERT INTO care_plan_long_term_goals (
    id, tenant_id, care_plan_id, sequence_no, title, description,
    target_period_from, target_period_to
  )
  SELECT
    (g->>'id')::UUID,
    (v_plan->>'tenant_id')::UUID,
    v_plan_id,
    (g->>'sequence_no')::INTEGER,
    g->>'title',
    g->>'description',
    (g->>'target_period_from')::DATE,
    (g->>'target_period_to')::DATE
  FROM jsonb_array_elements(p_payload->'long_term_goals') AS g;

  INSERT INTO care_plan_short_term_goals (
    id, tenant_id, care_plan_id, parent_long_term_goal_id,
    sequence_no, title, description, target_period_from, target_period_to
  )
  SELECT
    (g->>'id')::UUID,
    (v_plan->>'tenant_id')::UUID,
    v_plan_id,
    (g->>'parent_long_term_goal_id')::UUID,
    (g->>'sequence_no')::INTEGER,
    g->>'title',
    g->>'description',
    (g->>'target_period_from')::DATE,
    (g->>'target_period_to')::DATE
  FROM jsonb_array_elements(p_payload->'short_term_goals') AS g;

  INSERT INTO care_plan_service_items (
    id, tenant_id, care_plan_id, related_short_term_goal_id,
    sequence_no, service_type, service_name, frequency_text,
    frequency_per_week, provider_name, remarks
  )
  SELECT
    (s->>'id')::UUID,
    (v_plan->>'tenant_id')::UUID,
    v_plan_id,
    NULLIF(s->>'related_short_term_goal_id', '')::UUID,
    (s->>'sequence_no')::INTEGER,
    s->>'service_type',
    s->>'service_name',
    s->>'frequency_text',
    NULLIF(s->>'frequency_per_week', '')::INTEGER,
    s->>'provider_name',
    s->>'remarks'
  FROM jsonb_array_elements(p_payload->'service_items') AS s;
END;
$$;

CREATE OR REPLACE FUNCTION create_successor_care_plan(
  p_new_plan       JSONB,
  p_predecessor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. 前プランが Finalized であることを確認
  IF NOT EXISTS (
    SELECT 1 FROM care_plans WHERE id = p_predecessor_id AND status = 'finalized'
  ) THEN
    RAISE EXCEPTION 'predecessor_not_finalized: id=%', p_predecessor_id;
  END IF;

  -- 2. 前プランを Archived に遷移
  UPDATE care_plans
  SET status     = 'archived',
      updated_at = v_now,
      version    = version + 1
  WHERE id = p_predecessor_id;

  -- 3. 新プランを INSERT
  INSERT INTO care_plans (
    id, tenant_id, care_recipient_id, assessment_id, plan_number,
    plan_period_from, plan_period_to, status,
    created_by, created_at, updated_at, version
  ) VALUES (
    (p_new_plan->'plan'->>'id')::UUID,
    (p_new_plan->'plan'->>'tenant_id')::UUID,
    (p_new_plan->'plan'->>'care_recipient_id')::UUID,
    (p_new_plan->'plan'->>'assessment_id')::UUID,
    p_new_plan->'plan'->>'plan_number',
    (p_new_plan->'plan'->>'plan_period_from')::DATE,
    (p_new_plan->'plan'->>'plan_period_to')::DATE,
    'draft',
    (p_new_plan->'plan'->>'created_by')::UUID,
    v_now, v_now, 1
  );

  -- 4. 子テーブル INSERT (long_term -> short_term -> service の順)
  INSERT INTO care_plan_long_term_goals (
    id, tenant_id, care_plan_id, sequence_no, title, description,
    target_period_from, target_period_to
  )
  SELECT
    (g->>'id')::UUID,
    (p_new_plan->'plan'->>'tenant_id')::UUID,
    (p_new_plan->'plan'->>'id')::UUID,
    (g->>'sequence_no')::INTEGER,
    g->>'title', g->>'description',
    (g->>'target_period_from')::DATE,
    (g->>'target_period_to')::DATE
  FROM jsonb_array_elements(p_new_plan->'long_term_goals') AS g;

  INSERT INTO care_plan_short_term_goals (
    id, tenant_id, care_plan_id, parent_long_term_goal_id,
    sequence_no, title, description, target_period_from, target_period_to
  )
  SELECT
    (g->>'id')::UUID,
    (p_new_plan->'plan'->>'tenant_id')::UUID,
    (p_new_plan->'plan'->>'id')::UUID,
    (g->>'parent_long_term_goal_id')::UUID,
    (g->>'sequence_no')::INTEGER,
    g->>'title', g->>'description',
    (g->>'target_period_from')::DATE,
    (g->>'target_period_to')::DATE
  FROM jsonb_array_elements(p_new_plan->'short_term_goals') AS g;

  INSERT INTO care_plan_service_items (
    id, tenant_id, care_plan_id, related_short_term_goal_id,
    sequence_no, service_type, service_name, frequency_text,
    frequency_per_week, provider_name, remarks
  )
  SELECT
    (s->>'id')::UUID,
    (p_new_plan->'plan'->>'tenant_id')::UUID,
    (p_new_plan->'plan'->>'id')::UUID,
    NULLIF(s->>'related_short_term_goal_id', '')::UUID,
    (s->>'sequence_no')::INTEGER,
    s->>'service_type',
    s->>'service_name',
    s->>'frequency_text',
    NULLIF(s->>'frequency_per_week', '')::INTEGER,
    s->>'provider_name',
    s->>'remarks'
  FROM jsonb_array_elements(p_new_plan->'service_items') AS s;
END;
$$;

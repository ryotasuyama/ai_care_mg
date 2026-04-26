-- save_assessment RPC: アセスメント集約を 1 トランザクションで保存
-- 楽観的ロック検証 + version + 1、子の全削除→再挿入、子 ID 永続性契約
-- 設計参照: docs/assessment-aggregate-design.md §7.4

CREATE OR REPLACE FUNCTION save_assessment(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_assessment_id UUID;
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_assessment JSONB;
BEGIN
  v_assessment := p_payload->'assessment';
  v_assessment_id := (v_assessment->>'id')::UUID;
  v_new_version := (v_assessment->>'version')::INTEGER;

  SELECT version INTO v_current_version
  FROM assessments WHERE id = v_assessment_id;

  IF v_current_version IS NULL THEN
    INSERT INTO assessments (
      id, tenant_id, care_recipient_id, type, status,
      conducted_at, source_transcript, masked_summary, placeholder_map,
      created_by, created_at, updated_at, finalized_at, version
    ) VALUES (
      v_assessment_id,
      (v_assessment->>'tenant_id')::UUID,
      (v_assessment->>'care_recipient_id')::UUID,
      v_assessment->>'type',
      v_assessment->>'status',
      (v_assessment->>'conducted_at')::DATE,
      v_assessment->>'source_transcript',
      v_assessment->>'masked_summary',
      v_assessment->'placeholder_map',
      (v_assessment->>'created_by')::UUID,
      (v_assessment->>'created_at')::TIMESTAMPTZ,
      (v_assessment->>'updated_at')::TIMESTAMPTZ,
      NULLIF(v_assessment->>'finalized_at', '')::TIMESTAMPTZ,
      v_new_version
    );
  ELSE
    IF v_current_version != v_new_version THEN
      RAISE EXCEPTION 'version_conflict: expected %, got %',
        v_current_version, v_new_version;
    END IF;
    UPDATE assessments
    SET status = v_assessment->>'status',
        masked_summary = v_assessment->>'masked_summary',
        placeholder_map = v_assessment->'placeholder_map',
        updated_at = (v_assessment->>'updated_at')::TIMESTAMPTZ,
        finalized_at = NULLIF(v_assessment->>'finalized_at', '')::TIMESTAMPTZ,
        version = version + 1
    WHERE id = v_assessment_id;
  END IF;

  -- 課題は全削除→再挿入。子 ID は payload からそのまま採用 (永続性契約)
  DELETE FROM assessment_issues WHERE assessment_id = v_assessment_id;

  INSERT INTO assessment_issues (
    id, tenant_id, assessment_id, sequence_no, category, description, priority
  )
  SELECT
    (issue->>'id')::UUID,
    (v_assessment->>'tenant_id')::UUID,
    v_assessment_id,
    (issue->>'sequence_no')::INTEGER,
    issue->>'category',
    issue->>'description',
    issue->>'priority'
  FROM jsonb_array_elements(p_payload->'issues') AS issue;
END;
$$;

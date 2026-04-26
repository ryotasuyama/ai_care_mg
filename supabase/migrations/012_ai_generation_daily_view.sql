-- ai_generation_logs の日次・テナント別・種類別集計ビュー
-- Supabase Dashboard から管理者が手動クエリして利用する（MVP 段階）

CREATE VIEW public.v_ai_generation_daily AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'Asia/Tokyo') AS day,
  tenant_id,
  kind,
  COUNT(*)                                                  AS call_count,
  COALESCE(SUM(request_tokens), 0)                         AS total_request_tokens,
  COALESCE(SUM(response_tokens), 0)                        AS total_response_tokens,
  COALESCE(AVG(latency_ms)::int, 0)                        AS avg_latency_ms
FROM public.ai_generation_logs
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

COMMENT ON VIEW public.v_ai_generation_daily IS
  'AI生成ログの日次・テナント別・種類別集計。コスト・レイテンシ監視用。管理者が Supabase Dashboard からクエリする。';

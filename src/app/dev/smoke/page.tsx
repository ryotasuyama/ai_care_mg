import { notFound } from 'next/navigation';
import {
  smokeAssessmentSummarization,
  smokeCarePlanGeneration,
  smokeEmailReplyDraft,
  smokeEmbedding,
} from './actions';

// 本番環境では 404 を返す
export default function DevSmokePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <SmokePage />;
}

function SmokePage() {
  return (
    <div style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>AI Support Smoke Tests</h1>
      <p>各ボタンで Server Action を呼び出して結果を確認してください。</p>
      <SmokeSection label="Assessment Summarization" action={smokeAssessmentSummarization} />
      <SmokeSection label="Care Plan Generation" action={smokeCarePlanGeneration} />
      <SmokeSection label="Email Reply Draft" action={smokeEmailReplyDraft} />
      <SmokeSection label="Embedding" action={smokeEmbedding} />
    </div>
  );
}

function SmokeSection({
  label,
  action,
}: {
  label: string;
  action: () => Promise<unknown>;
}) {
  return (
    <section style={{ marginTop: '2rem', border: '1px solid #ccc', padding: '1rem' }}>
      <h2>{label}</h2>
      <form
        action={async () => {
          'use server';
          const result = await action();
          console.log(`[smoke] ${label}:`, JSON.stringify(result, null, 2));
        }}
      >
        <button type="submit">実行</button>
      </form>
      <p style={{ color: '#666', fontSize: '0.85em' }}>
        結果はサーバーログ（console.log）で確認してください。
      </p>
    </section>
  );
}

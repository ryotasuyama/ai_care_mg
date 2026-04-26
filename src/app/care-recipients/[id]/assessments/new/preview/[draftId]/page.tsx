import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { TenantId } from '@/domain/shared/TenantId';
import { MaskingPreviewForm } from '@/components/assessments/MaskingPreviewForm';

interface Props {
  params: Promise<{ id: string; draftId: string }>;
}

export default async function MaskingPreviewPage({ params }: Props) {
  const { id, draftId } = await params;
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  const draft = await container.assessmentDraftRepo.findById(
    draftId,
    new TenantId(auth.tenantId),
  );
  if (!draft) notFound();

  const placeholders = draft.maskingResult.placeholders.map((p) => ({
    token: p.token,
    originalValue: p.originalValue,
    category: p.category,
  }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/care-recipients/${id}/assessments/new`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 入力画面に戻る
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          マスキング確認
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          原文と AI に送るマスク済みテキストを比較してください。マスク漏れがあれば右側を編集してから送信できます。
        </p>
      </div>

      <MaskingPreviewForm
        careRecipientId={id}
        draftId={draftId}
        originalText={draft.maskingResult.originalText}
        maskedText={draft.maskingResult.maskedText}
        placeholders={placeholders}
        defaultConductedAt={today}
      />
    </div>
  );
}

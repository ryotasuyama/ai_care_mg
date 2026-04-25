import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { ASSESSMENT_TYPE_LABELS } from '@/domain/care-management/assessment/AssessmentType';
import {
  ASSESSMENT_STATUS_LABELS,
  AssessmentStatus,
} from '@/domain/care-management/assessment/AssessmentStatus';
import { ISSUE_CATEGORY_LABELS } from '@/domain/care-management/assessment/IssueCategory';
import { IssueEditor } from '@/components/assessments/IssueEditor';
import { FinalizeButton } from '@/components/assessments/FinalizeButton';

interface Props {
  params: Promise<{ id: string; assessmentId: string }>;
}

export default async function AssessmentDetailPage({ params }: Props) {
  const { id, assessmentId } = await params;
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  let dto;
  try {
    dto = await container.getAssessmentForViewUseCase.execute({ auth, assessmentId });
  } catch (error) {
    if (error instanceof UseCaseError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const editable = dto.status === AssessmentStatus.Draft;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/care-recipients/${id}/assessments`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← アセスメント履歴
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {ASSESSMENT_TYPE_LABELS[dto.type]}アセスメント
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              実施日 {dto.conductedAt}
              {' ・ '}
              <span
                className={
                  dto.status === AssessmentStatus.Finalized
                    ? 'text-green-700'
                    : 'text-yellow-700'
                }
              >
                {ASSESSMENT_STATUS_LABELS[dto.status]}
              </span>
            </p>
          </div>
          {editable && (
            <FinalizeButton careRecipientId={id} assessmentId={dto.id} />
          )}
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-gray-700">要約（アンマスク表示）</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-sm">
          <p className="whitespace-pre-wrap">{dto.summary}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-gray-700">
          課題・ニーズ ({dto.issues.length} 件)
        </h2>
        <IssueEditor
          careRecipientId={id}
          assessmentId={dto.id}
          editable={editable}
          issues={dto.issues.map((i) => ({
            id: i.id,
            sequenceNo: i.sequenceNo,
            category: i.category,
            description: i.description,
            priority: i.priority,
          }))}
        />
        <p className="mt-3 text-xs text-gray-500">
          カテゴリ凡例: {Object.values(ISSUE_CATEGORY_LABELS).join(' / ')}
        </p>
      </section>
    </div>
  );
}

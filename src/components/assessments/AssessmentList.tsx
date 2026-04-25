import Link from 'next/link';
import { ASSESSMENT_TYPE_LABELS } from '@/domain/care-management/assessment/AssessmentType';
import { ASSESSMENT_STATUS_LABELS } from '@/domain/care-management/assessment/AssessmentStatus';
import type { AssessmentSummaryDto } from '@/application/care-management/assessment/ListAssessmentsUseCase';

interface Props {
  items: AssessmentSummaryDto[];
  showRecipient?: boolean;
}

export function AssessmentList({ items, showRecipient = true }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        アセスメントはまだ作成されていません。
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/care-recipients/${item.careRecipientId}/assessments/${item.id}`}
            className="block px-6 py-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {showRecipient && (
                    <span className="text-sm font-medium text-gray-900">
                      {item.careRecipientName}
                    </span>
                  )}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {ASSESSMENT_TYPE_LABELS[item.type]}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-xs text-gray-500">
                  実施日 {item.conductedAt} ・ 課題 {item.issueCount} 件
                </p>
              </div>
              <span className="text-sm text-gray-400">→</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'finalized' }) {
  const cls =
    status === 'finalized'
      ? 'bg-green-100 text-green-800'
      : 'bg-yellow-100 text-yellow-800';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {ASSESSMENT_STATUS_LABELS[status]}
    </span>
  );
}

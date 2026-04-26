import Link from 'next/link';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { AssessmentList } from '@/components/assessments/AssessmentList';

export default async function AssessmentsIndexPage() {
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  const items = await container.listAssessmentsUseCase.execute({ auth });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">アセスメント一覧</h1>
        <Link
          href="/care-recipients"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          利用者から新規作成 →
        </Link>
      </div>
      <AssessmentList items={items} />
    </div>
  );
}

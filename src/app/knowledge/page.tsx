import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { KnowledgeUploadForm } from '@/components/knowledge/KnowledgeUploadForm';
import { KnowledgeList } from '@/components/knowledge/KnowledgeList';

export default async function KnowledgeIndexPage() {
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  const items = await container.listKnowledgeDocumentsUseCase.execute({ auth });

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">ナレッジベース</h1>
        <p className="mt-1 text-sm text-gray-500">
          PDF / DOCX / TXT (20MB 以下) をアップロードしてケアプラン生成時の参照ナレッジに追加できます。
          埋め込み生成は数分かかる場合があります。
        </p>
      </div>

      <KnowledgeUploadForm isAdmin={auth.role === 'admin'} />

      <KnowledgeList items={items} currentUserId={auth.userId} isAdmin={auth.role === 'admin'} />
    </div>
  );
}

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-5xl font-bold text-gray-300">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">ページが見つかりません</h1>
        <p className="mt-3 text-sm text-gray-600">
          指定されたページは存在しないか、削除された可能性があります。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          トップページへ
        </Link>
      </div>
    </div>
  );
}

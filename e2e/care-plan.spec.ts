import { test, expect } from '@playwright/test';

// E2E テストには実際の Supabase プロジェクトと管理者アカウントが必要です。
// 以下の環境変数を設定してから実行してください:
//   E2E_ADMIN_EMAIL=admin@example.com
//   E2E_ADMIN_PASSWORD=your-password

const ADMIN_EMAIL = process.env['E2E_ADMIN_EMAIL'] ?? '';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? '';
const IS_CI = !!process.env['CI'];

test.describe('ケアプラン作成フロー', () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'E2E credentials not set');
  test.skip(IS_CI, 'Finalized アセスメントの事前準備が必要なため CI ではスキップ');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/care-recipients');
  });

  test('Finalized アセスメント → ケアプランドラフト生成 → 採用 → 編集 → 確定', async ({
    page,
  }) => {
    // 前提: E2E_RECIPIENT_ID と E2E_ASSESSMENT_ID に Finalized アセスメントが存在すること
    const recipientId = process.env['E2E_RECIPIENT_ID'];
    const assessmentId = process.env['E2E_ASSESSMENT_ID'];

    if (!recipientId || !assessmentId) {
      test.skip(true, 'E2E_RECIPIENT_ID / E2E_ASSESSMENT_ID が設定されていません');
      return;
    }

    // ケアプランドラフト生成画面へ
    await page.goto(`/care-recipients/${recipientId}/care-plans/draft/${assessmentId}`);
    await expect(page.locator('h1')).toContainText('ケアプランドラフト生成');

    // ドラフト生成ボタンをクリック（実際の Gemini API 呼び出し）
    await page.click('button:has-text("ドラフト生成")');
    await page.waitForSelector('text=長期目標', { timeout: 60_000 });

    // 長期目標が少なくとも 1 件生成されていること
    await expect(page.locator('[data-testid="long-term-goal"]').first()).toBeVisible();

    // 採用ボタンをクリック
    await page.click('button:has-text("このドラフトを採用")');
    await page.waitForURL(`**/care-recipients/${recipientId}/care-plans/**`, { timeout: 15_000 });

    // ケアプラン詳細画面に遷移していること
    await expect(page.locator('h1')).toContainText('ケアプラン');

    // 確定ボタンをクリック
    await page.click('button:has-text("確定")');
    await expect(page.locator('text=Finalized')).toBeVisible({ timeout: 10_000 });
  });

  test('別テナントユーザーにはケアプランが見えないこと (RLS)', async () => {
    test.skip(true, '別テナントアカウントが必要な手動テスト');
  });
});

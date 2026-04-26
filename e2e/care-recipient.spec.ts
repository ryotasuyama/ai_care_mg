import { test, expect } from '@playwright/test';

// E2E テストには実際の Supabase プロジェクトと管理者アカウントが必要です。
// 以下の環境変数を設定してから実行してください:
//   E2E_ADMIN_EMAIL=admin@example.com
//   E2E_ADMIN_PASSWORD=your-password

const ADMIN_EMAIL = process.env['E2E_ADMIN_EMAIL'] ?? '';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? '';

test.describe('利用者管理フロー', () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'E2E credentials not set');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/care-recipients');
  });

  test('ログイン → 利用者登録 → 詳細画面表示', async ({ page }) => {
    const testName = `テスト太郎 ${Date.now()}`;

    await page.click('text=新規登録');
    await page.waitForURL('**/care-recipients/new');

    await page.fill('input[name="fullName"]', testName);
    await page.fill('input[name="dateOfBirth"]', '1940-05-15');
    await page.fill('input[name="address"]', '東京都テスト区1-1-1');
    await page.selectOption('select[name="currentCareLevel"]', 'care_2');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/care-recipients');
    await expect(page.locator(`text=${testName}`)).toBeVisible();

    await page.getByRole('row', { name: testName }).getByRole('link', { name: '詳細' }).click();
    await page.waitForURL('**/care-recipients/**');
    await expect(page.locator('h1')).toContainText(testName);
    await expect(page.locator('text=要介護2')).toBeVisible();
  });

  test('利用者編集 → 要介護度変更', async ({ page }) => {
    const testName = `変更テスト ${Date.now()}`;

    // 先に登録
    await page.goto('/care-recipients/new');
    await page.fill('input[name="fullName"]', testName);
    await page.fill('input[name="dateOfBirth"]', '1935-01-10');
    await page.fill('input[name="address"]', '大阪府テスト市2-2-2');
    await page.selectOption('select[name="currentCareLevel"]', 'care_2');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/care-recipients');

    // 詳細 → 編集
    await page.getByRole('row', { name: testName }).getByRole('link', { name: '詳細' }).click();
    await page.waitForURL('**/care-recipients/**');
    await page.click('text=編集');
    await page.waitForURL('**/edit');

    await page.selectOption('select[name="currentCareLevel"]', 'care_3');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/care-recipients/**');

    await expect(page.locator('text=要介護3')).toBeVisible();
  });

  test('別テナントユーザーには利用者が見えないこと (RLS)', async () => {
    // このテストは別テナントのユーザーアカウントが必要なため、
    // 実環境での手動検証を推奨
    test.skip(true, '別テナントアカウントが必要な手動テスト');
  });
});

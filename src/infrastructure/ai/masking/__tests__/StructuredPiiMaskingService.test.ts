import { describe, it, expect, beforeEach } from 'vitest';
import { StructuredPiiMaskingService } from '../StructuredPiiMaskingService';

describe('StructuredPiiMaskingService', () => {
  let service: StructuredPiiMaskingService;

  beforeEach(() => {
    service = new StructuredPiiMaskingService();
  });

  describe('既知PII（DB登録済み）の置換', () => {
    it('利用者氏名を置換する', async () => {
      const result = await service.mask(
        '田中太郎さんは膝が痛いと話していた',
        { recipientName: '田中太郎' },
      );
      expect(result.maskedText).not.toContain('田中太郎');
      expect(result.maskedText).toContain('{RECIPIENT_NAME_');
    });

    it('氏名エイリアスも置換する', async () => {
      const result = await service.mask(
        '田中太郎さんと田中さんが来た',
        { recipientName: '田中太郎', recipientNameAliases: ['田中太郎さん', '田中さん'] },
      );
      expect(result.maskedText).not.toContain('田中太郎');
      expect(result.maskedText).not.toContain('田中さん');
    });

    it('長い名前を優先して置換する（部分一致防止）', async () => {
      const result = await service.mask(
        '田中太郎さんと田中さんは別人です',
        {
          recipientName: '田中太郎',
          recipientNameAliases: ['田中太郎さん', '田中さん'],
        },
      );
      // 「田中太郎さん」が「田中さん」より先に置換されていること
      const tanakaWithSan = result.placeholders.find(
        (p) => p.originalValue === '田中太郎さん',
      );
      expect(tanakaWithSan).toBeDefined();
      // 元のテキストに田中が残っていないこと
      expect(result.maskedText).not.toContain('田中');
    });

    it('家族氏名を置換する', async () => {
      const result = await service.mask(
        '息子の田中一郎が同席していた',
        {
          recipientName: '田中太郎',
          familyMembers: [{ name: '田中一郎', relation: '息子' }],
        },
      );
      expect(result.maskedText).not.toContain('田中一郎');
      expect(result.maskedText).toContain('{FAMILY_NAME_');
    });

    it('既知電話番号を置換する', async () => {
      const result = await service.mask(
        '固定電話は 03-1234-5678 です',
        { recipientName: 'dummy', phones: ['03-1234-5678'] },
      );
      expect(result.maskedText).not.toContain('03-1234-5678');
    });
  });

  describe('正規表現パターン（MVP 5種類）', () => {
    it('携帯電話番号（ハイフンあり）を検出する', async () => {
      const result = await service.mask(
        '090-1234-5678 に連絡してください',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('090-1234-5678');
    });

    it('固定電話番号（ハイフンなし）を検出する', async () => {
      const result = await service.mask(
        '電話番号は0312345678です',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('0312345678');
    });

    it('メールアドレスを検出する', async () => {
      const result = await service.mask(
        '連絡先は care-manager@example.com です',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('care-manager@example.com');
      expect(result.maskedText).toContain('{EMAIL_');
    });

    it('郵便番号（ハイフンあり）を検出する', async () => {
      const result = await service.mask(
        '住所は〒123-4567 です',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('123-4567');
      expect(result.maskedText).toContain('{POSTAL_CODE_');
    });

    it('西暦生年月日（年月日形式）を検出する', async () => {
      const result = await service.mask(
        '1945年1月1日生まれです',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('1945年1月1日');
      expect(result.maskedText).toContain('{BIRTH_DATE_');
    });

    it('西暦生年月日（スラッシュ形式）を検出する', async () => {
      const result = await service.mask(
        '生年月日: 1945/01/01',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('1945/01/01');
    });

    it('和暦生年月日を検出する', async () => {
      const result = await service.mask(
        '昭和20年8月15日生まれ',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('昭和20年8月15日');
      expect(result.maskedText).toContain('{BIRTH_DATE_');
    });

    it('令和年号の生年月日を検出する', async () => {
      const result = await service.mask(
        '令和3年4月1日',
        { recipientName: 'dummy' },
      );
      expect(result.maskedText).not.toContain('令和3年4月1日');
    });
  });

  describe('MaskingResult の往復テスト', () => {
    it('unmask で元の値に戻せる', async () => {
      const result = await service.mask(
        '田中太郎に090-1234-5678で連絡',
        { recipientName: '田中太郎' },
      );
      const aiResponse = `${result.placeholders[0]?.token ?? ''} の状態は良好です`;
      const unmasked = result.unmask(aiResponse);
      expect(unmasked).toContain('田中太郎');
    });

    it('複数プレースホルダを一括アンマスクできる', async () => {
      const result = await service.mask(
        '田中太郎 090-1234-5678 care@example.com',
        { recipientName: '田中太郎' },
      );
      const allTokens = result.placeholders.map((p) => p.token).join(' ');
      const unmasked = result.unmask(allTokens);
      expect(unmasked).toContain('田中太郎');
      expect(unmasked).toContain('090-1234-5678');
      expect(unmasked).toContain('care@example.com');
    });
  });

  describe('statistics', () => {
    it('プレースホルダ統計を返す', async () => {
      const result = await service.mask(
        '田中太郎 090-1234-5678',
        { recipientName: '田中太郎' },
      );
      const stats = result.statistics;
      expect(stats.totalPlaceholders).toBeGreaterThanOrEqual(2);
      expect(stats.byCategory['recipient_name']).toBe(1);
      expect(stats.byCategory['phone']).toBe(1);
    });
  });

  describe('プレースホルダ衝突回避', () => {
    it('同一テキストが複数回出現しても二重置換しない', async () => {
      const result = await service.mask(
        '090-1234-5678 と 090-1234-5678 に電話',
        { recipientName: 'dummy' },
      );
      // 同一番号は1つのプレースホルダにまとめられる
      const phoneTokens = result.placeholders.filter((p) => p.category === 'phone');
      expect(phoneTokens).toHaveLength(1);
    });
  });
});

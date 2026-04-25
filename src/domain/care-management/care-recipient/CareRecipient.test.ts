import { describe, it, expect } from 'vitest';
import { CareRecipient } from './CareRecipient';
import { CareLevel } from './CareLevel';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { ValidationError } from '@/domain/shared/errors/ValidationError';

const tenantId = new TenantId('tenant-1');
const createdBy = new UserId('user-1');
const careLevel = CareLevel.of('care_2');

const baseInput = {
  tenantId,
  fullName: '田中太郎',
  dateOfBirth: new Date('1940-05-15'),
  address: '東京都新宿区1-1-1',
  currentCareLevel: careLevel,
  createdBy,
};

describe('CareRecipient.create', () => {
  it('creates with valid input', () => {
    const r = CareRecipient.create(baseInput);
    expect(r.fullName).toBe('田中太郎');
    expect(r.currentCareLevel.value).toBe('care_2');
    expect(r.familyMembers).toHaveLength(0);
  });

  it('trims whitespace from fullName and address', () => {
    const r = CareRecipient.create({ ...baseInput, fullName: '  田中  ', address: '  東京都  ' });
    expect(r.fullName).toBe('田中');
    expect(r.address).toBe('東京都');
  });

  it('throws ValidationError on empty fullName', () => {
    expect(() => CareRecipient.create({ ...baseInput, fullName: '' })).toThrow(ValidationError);
  });

  it('throws ValidationError on empty address', () => {
    expect(() => CareRecipient.create({ ...baseInput, address: '' })).toThrow(ValidationError);
  });
});

describe('CareRecipient.ageRange', () => {
  it('returns correct range for 80-year-old', () => {
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 83);
    const r = CareRecipient.create({ ...baseInput, dateOfBirth: birth });
    expect(r.ageRange).toBe('80代');
  });

  it('returns 90代以上 for age >= 90', () => {
    const birth = new Date();
    birth.setFullYear(birth.getFullYear() - 92);
    const r = CareRecipient.create({ ...baseInput, dateOfBirth: birth });
    expect(r.ageRange).toBe('90代以上');
  });
});

describe('CareRecipient.update', () => {
  it('updates mutable fields', () => {
    const r = CareRecipient.create(baseInput);
    r.update({ fullName: '鈴木次郎', currentCareLevel: CareLevel.of('care_3') });
    expect(r.fullName).toBe('鈴木次郎');
    expect(r.currentCareLevel.value).toBe('care_3');
  });

  it('throws ValidationError on empty fullName update', () => {
    const r = CareRecipient.create(baseInput);
    expect(() => r.update({ fullName: '' })).toThrow(ValidationError);
  });
});

describe('CareLevel', () => {
  it('throws on invalid value', () => {
    expect(() => CareLevel.of('invalid')).toThrow(ValidationError);
  });

  it('returns label', () => {
    expect(CareLevel.of('care_3').label).toBe('要介護3');
  });
});

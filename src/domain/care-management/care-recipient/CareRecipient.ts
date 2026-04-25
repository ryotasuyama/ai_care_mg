import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { ValidationError } from '@/domain/shared/errors/ValidationError';
import { CareRecipientId } from './CareRecipientId';
import { CareLevel } from './CareLevel';

export interface FamilyMember {
  name: string;
  relation: string;
  phoneNumber?: string;
}

export interface CareRecipientProps {
  id: CareRecipientId;
  tenantId: TenantId;
  fullName: string;
  dateOfBirth: Date;
  address: string;
  phoneNumber: string | null;
  currentCareLevel: CareLevel;
  familyMembers: FamilyMember[];
  createdBy: UserId;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCareRecipientInput {
  tenantId: TenantId;
  fullName: string;
  dateOfBirth: Date;
  address: string;
  phoneNumber?: string;
  currentCareLevel: CareLevel;
  familyMembers?: FamilyMember[];
  createdBy: UserId;
}

export class CareRecipient {
  private readonly _id: CareRecipientId;
  private readonly _tenantId: TenantId;
  private _fullName: string;
  private readonly _dateOfBirth: Date;
  private _address: string;
  private _phoneNumber: string | null;
  private _currentCareLevel: CareLevel;
  private _familyMembers: FamilyMember[];
  private readonly _createdBy: UserId;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: CareRecipientProps) {
    this._id = props.id;
    this._tenantId = props.tenantId;
    this._fullName = props.fullName;
    this._dateOfBirth = props.dateOfBirth;
    this._address = props.address;
    this._phoneNumber = props.phoneNumber;
    this._currentCareLevel = props.currentCareLevel;
    this._familyMembers = props.familyMembers;
    this._createdBy = props.createdBy;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  static create(input: CreateCareRecipientInput): CareRecipient {
    if (!input.fullName || input.fullName.trim() === '') {
      throw new ValidationError('fullName', '氏名は必須です');
    }
    if (!input.address || input.address.trim() === '') {
      throw new ValidationError('address', '住所は必須です');
    }
    const now = new Date();
    return new CareRecipient({
      id: new CareRecipientId(crypto.randomUUID()),
      tenantId: input.tenantId,
      fullName: input.fullName.trim(),
      dateOfBirth: input.dateOfBirth,
      address: input.address.trim(),
      phoneNumber: input.phoneNumber ?? null,
      currentCareLevel: input.currentCareLevel,
      familyMembers: input.familyMembers ?? [],
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstruct(props: CareRecipientProps): CareRecipient {
    return new CareRecipient(props);
  }

  update(params: {
    fullName?: string;
    address?: string;
    phoneNumber?: string | null;
    currentCareLevel?: CareLevel;
    familyMembers?: FamilyMember[];
  }): void {
    if (params.fullName !== undefined) {
      if (!params.fullName.trim()) throw new ValidationError('fullName', '氏名は必須です');
      this._fullName = params.fullName.trim();
    }
    if (params.address !== undefined) {
      if (!params.address.trim()) throw new ValidationError('address', '住所は必須です');
      this._address = params.address.trim();
    }
    if (params.phoneNumber !== undefined) this._phoneNumber = params.phoneNumber;
    if (params.currentCareLevel !== undefined) this._currentCareLevel = params.currentCareLevel;
    if (params.familyMembers !== undefined) this._familyMembers = params.familyMembers;
    this._updatedAt = new Date();
  }

  get ageRange(): '60代' | '70代' | '80代' | '90代以上' {
    const now = new Date();
    const age = now.getFullYear() - this._dateOfBirth.getFullYear();
    if (age < 70) return '60代';
    if (age < 80) return '70代';
    if (age < 90) return '80代';
    return '90代以上';
  }

  get id(): CareRecipientId {
    return this._id;
  }
  get tenantId(): TenantId {
    return this._tenantId;
  }
  get fullName(): string {
    return this._fullName;
  }
  get dateOfBirth(): Date {
    return this._dateOfBirth;
  }
  get address(): string {
    return this._address;
  }
  get phoneNumber(): string | null {
    return this._phoneNumber;
  }
  get currentCareLevel(): CareLevel {
    return this._currentCareLevel;
  }
  get familyMembers(): FamilyMember[] {
    return [...this._familyMembers];
  }
  get createdBy(): UserId {
    return this._createdBy;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
}

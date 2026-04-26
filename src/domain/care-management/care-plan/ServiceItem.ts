import { ServiceItemId } from './ServiceItemId';
import { ShortTermGoalId } from './ShortTermGoalId';
import { CarePlanValidationError } from './CarePlanValidationError';

export class ServiceItem {
  private constructor(
    private readonly _id: ServiceItemId,
    private _relatedShortTermGoalId: ShortTermGoalId | null,
    private _sequenceNo: number,
    private _serviceType: string,
    private _serviceName: string,
    private _frequencyText: string | null,
    private _frequencyPerWeek: number | null,
    private _providerName: string | null,
    private _remarks: string | null,
  ) {}

  static create(params: {
    relatedShortTermGoalId?: ShortTermGoalId | null;
    sequenceNo: number;
    serviceType: string;
    serviceName: string;
    frequencyText?: string | null;
    frequencyPerWeek?: number | null;
    providerName?: string | null;
    remarks?: string | null;
  }): ServiceItem {
    if (params.serviceType.trim().length === 0) {
      throw new CarePlanValidationError('サービス種別は空にできません');
    }
    if (params.serviceName.trim().length === 0) {
      throw new CarePlanValidationError('サービス名は空にできません');
    }
    return new ServiceItem(
      ServiceItemId.generate(),
      params.relatedShortTermGoalId ?? null,
      params.sequenceNo,
      params.serviceType,
      params.serviceName,
      params.frequencyText ?? null,
      params.frequencyPerWeek ?? null,
      params.providerName ?? null,
      params.remarks ?? null,
    );
  }

  static reconstruct(params: {
    id: ServiceItemId;
    relatedShortTermGoalId: ShortTermGoalId | null;
    sequenceNo: number;
    serviceType: string;
    serviceName: string;
    frequencyText: string | null;
    frequencyPerWeek: number | null;
    providerName: string | null;
    remarks: string | null;
  }): ServiceItem {
    return new ServiceItem(
      params.id,
      params.relatedShortTermGoalId,
      params.sequenceNo,
      params.serviceType,
      params.serviceName,
      params.frequencyText,
      params.frequencyPerWeek,
      params.providerName,
      params.remarks,
    );
  }

  update(params: {
    relatedShortTermGoalId?: ShortTermGoalId | null;
    serviceType?: string;
    serviceName?: string;
    frequencyText?: string | null;
    frequencyPerWeek?: number | null;
    providerName?: string | null;
    remarks?: string | null;
  }): void {
    if (params.serviceType !== undefined) {
      if (params.serviceType.trim().length === 0)
        throw new CarePlanValidationError('サービス種別は空にできません');
      this._serviceType = params.serviceType;
    }
    if (params.serviceName !== undefined) {
      if (params.serviceName.trim().length === 0)
        throw new CarePlanValidationError('サービス名は空にできません');
      this._serviceName = params.serviceName;
    }
    if (params.relatedShortTermGoalId !== undefined)
      this._relatedShortTermGoalId = params.relatedShortTermGoalId;
    if (params.frequencyText !== undefined) this._frequencyText = params.frequencyText;
    if (params.frequencyPerWeek !== undefined) this._frequencyPerWeek = params.frequencyPerWeek;
    if (params.providerName !== undefined) this._providerName = params.providerName;
    if (params.remarks !== undefined) this._remarks = params.remarks;
  }

  get id(): ServiceItemId {
    return this._id;
  }
  get relatedShortTermGoalId(): ShortTermGoalId | null {
    return this._relatedShortTermGoalId;
  }
  get sequenceNo(): number {
    return this._sequenceNo;
  }
  get serviceType(): string {
    return this._serviceType;
  }
  get serviceName(): string {
    return this._serviceName;
  }
  get frequencyText(): string | null {
    return this._frequencyText;
  }
  get frequencyPerWeek(): number | null {
    return this._frequencyPerWeek;
  }
  get providerName(): string | null {
    return this._providerName;
  }
  get remarks(): string | null {
    return this._remarks;
  }
}

import type { CarePlanStatus } from '@/domain/care-management/care-plan/CarePlanStatus';

export interface LongTermGoalDto {
  id: string;
  sequenceNo: number;
  title: string;
  description: string | null;
  targetPeriodFrom: string;
  targetPeriodTo: string;
}

export interface ShortTermGoalDto {
  id: string;
  parentLongTermGoalId: string;
  sequenceNo: number;
  title: string;
  description: string | null;
  targetPeriodFrom: string;
  targetPeriodTo: string;
}

export interface ServiceItemDto {
  id: string;
  relatedShortTermGoalId: string | null;
  sequenceNo: number;
  serviceType: string;
  serviceName: string;
  frequencyText: string | null;
  frequencyPerWeek: number | null;
  providerName: string | null;
  remarks: string | null;
}

export interface CarePlanViewDto {
  id: string;
  careRecipientId: string;
  assessmentId: string;
  planNumber: string;
  planPeriodFrom: string;
  planPeriodTo: string;
  status: CarePlanStatus;
  longTermGoals: LongTermGoalDto[];
  shortTermGoals: ShortTermGoalDto[];
  serviceItems: ServiceItemDto[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  version: number;
}

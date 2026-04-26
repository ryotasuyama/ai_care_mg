import type { AssessmentStatus } from '@/domain/care-management/assessment/AssessmentStatus';
import type { AssessmentType } from '@/domain/care-management/assessment/AssessmentType';
import type {
  IssueCategory,
  IssuePriority,
} from '@/domain/care-management/assessment/IssueCategory';

export interface AssessmentIssueViewDto {
  id: string;
  sequenceNo: number;
  category: IssueCategory;
  description: string;
  priority: IssuePriority;
}

export interface AssessmentViewDto {
  id: string;
  careRecipientId: string;
  type: AssessmentType;
  status: AssessmentStatus;
  conductedAt: string;
  summary: string;
  issues: AssessmentIssueViewDto[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  version: number;
}

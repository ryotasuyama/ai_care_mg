import { Assessment } from '@/domain/care-management/assessment/Assessment';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { AssessmentIssue } from '@/domain/care-management/assessment/AssessmentIssue';
import { AssessmentIssueId } from '@/domain/care-management/assessment/AssessmentIssueId';
import {
  PlaceholderMapSnapshot,
  type PlaceholderEntry,
} from '@/domain/care-management/assessment/PlaceholderMapSnapshot';
import type { AssessmentStatus } from '@/domain/care-management/assessment/AssessmentStatus';
import type { AssessmentType } from '@/domain/care-management/assessment/AssessmentType';
import type {
  IssueCategory,
  IssuePriority,
} from '@/domain/care-management/assessment/IssueCategory';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import type { Database, Json } from '@/types/database';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];
type AssessmentIssueRow = Database['public']['Tables']['assessment_issues']['Row'];

export interface SaveAssessmentPayload {
  assessment: {
    id: string;
    tenant_id: string;
    care_recipient_id: string;
    type: AssessmentType;
    status: AssessmentStatus;
    conducted_at: string;
    source_transcript: string;
    masked_summary: string;
    placeholder_map: PlaceholderEntry[];
    created_by: string;
    created_at: string;
    updated_at: string;
    finalized_at: string | null;
    version: number;
  };
  issues: Array<{
    id: string;
    sequence_no: number;
    category: IssueCategory;
    description: string;
    priority: IssuePriority;
  }>;
}

export class AssessmentMapper {
  static toDomain(input: { assessment: AssessmentRow; issues: AssessmentIssueRow[] }): Assessment {
    const entries = parsePlaceholderMap(input.assessment.placeholder_map);
    const issues = input.issues
      .slice()
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map((row) =>
        AssessmentIssue.reconstruct({
          id: new AssessmentIssueId(row.id),
          category: row.category,
          description: row.description,
          priority: row.priority,
          sequenceNo: row.sequence_no,
        }),
      );

    return Assessment.reconstruct({
      id: new AssessmentId(input.assessment.id),
      tenantId: new TenantId(input.assessment.tenant_id),
      careRecipientId: new CareRecipientId(input.assessment.care_recipient_id),
      type: input.assessment.type,
      issues,
      sourceTranscript: input.assessment.source_transcript,
      maskedSummary: input.assessment.masked_summary,
      placeholderMap: PlaceholderMapSnapshot.create(entries),
      status: input.assessment.status,
      conductedAt: new Date(input.assessment.conducted_at),
      createdBy: new UserId(input.assessment.created_by),
      createdAt: new Date(input.assessment.created_at),
      updatedAt: new Date(input.assessment.updated_at),
      finalizedAt: input.assessment.finalized_at ? new Date(input.assessment.finalized_at) : null,
      version: input.assessment.version,
    });
  }

  static toPersistence(assessment: Assessment): SaveAssessmentPayload {
    return {
      assessment: {
        id: assessment.id.value,
        tenant_id: assessment.tenantId.value,
        care_recipient_id: assessment.careRecipientId.value,
        type: assessment.type,
        status: assessment.status,
        conducted_at: toDateOnly(assessment.conductedAt),
        source_transcript: assessment.sourceTranscript,
        masked_summary: assessment.maskedSummary,
        placeholder_map: assessment.placeholderMap.toJSON(),
        created_by: assessment.createdBy.value,
        created_at: assessment.createdAt.toISOString(),
        updated_at: assessment.updatedAt.toISOString(),
        finalized_at: assessment.finalizedAt ? assessment.finalizedAt.toISOString() : null,
        version: assessment.version,
      },
      issues: assessment.issues.map((i) => ({
        id: i.id.value,
        sequence_no: i.sequenceNo,
        category: i.category,
        description: i.description,
        priority: i.priority,
      })),
    };
  }
}

function toDateOnly(d: Date): string {
  const iso = d.toISOString();
  const [datePart] = iso.split('T');
  return datePart!;
}

function parsePlaceholderMap(json: Json): PlaceholderEntry[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((e): e is Record<string, Json> => typeof e === 'object' && e !== null && !Array.isArray(e))
    .map((e) => ({
      token: String(e.token ?? ''),
      originalValue: String(e.originalValue ?? ''),
      category: String(e.category ?? ''),
    }))
    .filter((e) => e.token && e.originalValue);
}

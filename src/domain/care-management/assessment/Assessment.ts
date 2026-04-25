import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { AssessmentId } from './AssessmentId';
import { AssessmentIssue } from './AssessmentIssue';
import { AssessmentIssueId } from './AssessmentIssueId';
import { AssessmentStatus } from './AssessmentStatus';
import type { AssessmentType } from './AssessmentType';
import { PlaceholderMapSnapshot } from './PlaceholderMapSnapshot';
import { AssessmentValidationError } from './AssessmentValidationError';

export interface AssessmentReconstructProps {
  id: AssessmentId;
  tenantId: TenantId;
  careRecipientId: CareRecipientId;
  type: AssessmentType;
  issues: AssessmentIssue[];
  sourceTranscript: string;
  maskedSummary: string;
  placeholderMap: PlaceholderMapSnapshot;
  status: AssessmentStatus;
  conductedAt: Date;
  createdBy: UserId;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
  version: number;
}

export class Assessment {
  private constructor(
    private readonly _id: AssessmentId,
    private readonly _tenantId: TenantId,
    private readonly _careRecipientId: CareRecipientId,
    private readonly _type: AssessmentType,
    private _issues: AssessmentIssue[],
    private readonly _sourceTranscript: string,
    private _maskedSummary: string,
    private readonly _placeholderMap: PlaceholderMapSnapshot,
    private _status: AssessmentStatus,
    private readonly _conductedAt: Date,
    private readonly _createdBy: UserId,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private _finalizedAt: Date | null,
    private _version: number,
  ) {}

  static create(params: {
    tenantId: TenantId;
    careRecipientId: CareRecipientId;
    type: AssessmentType;
    issues: AssessmentIssue[];
    sourceTranscript: string;
    maskedSummary: string;
    placeholderMap: PlaceholderMapSnapshot;
    conductedAt: Date;
    createdBy: UserId;
  }): Assessment {
    if (params.issues.length === 0) {
      throw new AssessmentValidationError('課題は最低1件必要です');
    }
    if (params.sourceTranscript.trim().length === 0) {
      throw new AssessmentValidationError('音声原文は空にできません');
    }
    if (params.maskedSummary.trim().length === 0) {
      throw new AssessmentValidationError('要約は空にできません');
    }
    Assessment.validateIssueSequences(params.issues);

    const now = new Date();
    return new Assessment(
      AssessmentId.generate(),
      params.tenantId,
      params.careRecipientId,
      params.type,
      [...params.issues],
      params.sourceTranscript,
      params.maskedSummary,
      params.placeholderMap,
      AssessmentStatus.Draft,
      params.conductedAt,
      params.createdBy,
      now,
      now,
      null,
      1,
    );
  }

  static reconstruct(props: AssessmentReconstructProps): Assessment {
    return new Assessment(
      props.id,
      props.tenantId,
      props.careRecipientId,
      props.type,
      [...props.issues],
      props.sourceTranscript,
      props.maskedSummary,
      props.placeholderMap,
      props.status,
      props.conductedAt,
      props.createdBy,
      props.createdAt,
      props.updatedAt,
      props.finalizedAt,
      props.version,
    );
  }

  addIssue(issue: AssessmentIssue): void {
    this.assertEditable();
    if (this._issues.some((i) => i.sequenceNo === issue.sequenceNo)) {
      throw new AssessmentValidationError(
        `sequence_no ${issue.sequenceNo} は既に使われています`,
      );
    }
    this._issues.push(issue);
    this.touch();
  }

  removeIssue(issueId: AssessmentIssueId): void {
    this.assertEditable();
    if (this._issues.length === 1) {
      throw new AssessmentValidationError('課題は最低1件残す必要があります');
    }
    const next = this._issues.filter((i) => !i.id.equals(issueId));
    if (next.length === this._issues.length) {
      throw new AssessmentValidationError('課題が見つかりません');
    }
    this._issues = next;
    this.touch();
  }

  updateIssue(issueId: AssessmentIssueId, updater: (issue: AssessmentIssue) => void): void {
    this.assertEditable();
    const issue = this._issues.find((i) => i.id.equals(issueId));
    if (!issue) {
      throw new AssessmentValidationError('課題が見つかりません');
    }
    updater(issue);
    this.touch();
  }

  /** 編集 UI からの要約直接編集 (Draft のみ) */
  updateMaskedSummary(newSummary: string): void {
    this.assertEditable();
    if (newSummary.trim().length === 0) {
      throw new AssessmentValidationError('要約は空にできません');
    }
    this._maskedSummary = newSummary;
    this.touch();
  }

  finalize(): void {
    if (this._status !== AssessmentStatus.Draft) {
      throw new IllegalStateTransitionError(
        this._status,
        AssessmentStatus.Finalized,
        `Draft 状態のアセスメントのみ確定できます。現在: ${this._status}`,
      );
    }
    if (this._issues.length === 0) {
      throw new AssessmentValidationError('確定には課題が最低1件必要です');
    }
    const now = new Date();
    this._status = AssessmentStatus.Finalized;
    this._finalizedAt = now;
    this._updatedAt = now;
  }

  getUnmaskedSummary(): string {
    return this._placeholderMap.unmask(this._maskedSummary);
  }

  getUnmaskedIssueDescription(issueId: AssessmentIssueId): string {
    const issue = this._issues.find((i) => i.id.equals(issueId));
    if (!issue) {
      throw new AssessmentValidationError('課題が見つかりません');
    }
    return this._placeholderMap.unmask(issue.description);
  }

  /** 永続化用 (リポジトリのみが使う想定) */
  incrementVersion(): void {
    this._version += 1;
  }

  get id(): AssessmentId {
    return this._id;
  }
  get tenantId(): TenantId {
    return this._tenantId;
  }
  get careRecipientId(): CareRecipientId {
    return this._careRecipientId;
  }
  get type(): AssessmentType {
    return this._type;
  }
  get status(): AssessmentStatus {
    return this._status;
  }
  get issues(): ReadonlyArray<AssessmentIssue> {
    return this._issues;
  }
  get sourceTranscript(): string {
    return this._sourceTranscript;
  }
  get maskedSummary(): string {
    return this._maskedSummary;
  }
  get placeholderMap(): PlaceholderMapSnapshot {
    return this._placeholderMap;
  }
  get conductedAt(): Date {
    return this._conductedAt;
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
  get finalizedAt(): Date | null {
    return this._finalizedAt;
  }
  get version(): number {
    return this._version;
  }

  private assertEditable(): void {
    if (this._status !== AssessmentStatus.Draft) {
      throw new IllegalStateTransitionError(
        this._status,
        'edit',
        `編集可能なのは Draft 状態のみです。現在: ${this._status}`,
      );
    }
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  private static validateIssueSequences(issues: AssessmentIssue[]): void {
    const seqs = issues.map((i) => i.sequenceNo);
    if (new Set(seqs).size !== seqs.length) {
      throw new AssessmentValidationError('課題の sequence_no が重複しています');
    }
  }
}

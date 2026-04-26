import { AssessmentIssueId } from './AssessmentIssueId';
import type { IssueCategory, IssuePriority } from './IssueCategory';
import { AssessmentValidationError } from './AssessmentValidationError';

export class AssessmentIssue {
  private constructor(
    private readonly _id: AssessmentIssueId,
    private _category: IssueCategory,
    private _description: string,
    private _priority: IssuePriority,
    private _sequenceNo: number,
  ) {}

  static create(params: {
    category: IssueCategory;
    description: string;
    priority: IssuePriority;
    sequenceNo: number;
  }): AssessmentIssue {
    if (params.description.trim().length === 0) {
      throw new AssessmentValidationError('課題の説明は空にできません');
    }
    return new AssessmentIssue(
      AssessmentIssueId.generate(),
      params.category,
      params.description,
      params.priority,
      params.sequenceNo,
    );
  }

  static reconstruct(params: {
    id: AssessmentIssueId;
    category: IssueCategory;
    description: string;
    priority: IssuePriority;
    sequenceNo: number;
  }): AssessmentIssue {
    return new AssessmentIssue(
      params.id,
      params.category,
      params.description,
      params.priority,
      params.sequenceNo,
    );
  }

  updateDescription(newDescription: string): void {
    if (newDescription.trim().length === 0) {
      throw new AssessmentValidationError('課題の説明は空にできません');
    }
    this._description = newDescription;
  }

  updateCategory(category: IssueCategory): void {
    this._category = category;
  }

  updatePriority(priority: IssuePriority): void {
    this._priority = priority;
  }

  updateSequenceNo(sequenceNo: number): void {
    this._sequenceNo = sequenceNo;
  }

  get id(): AssessmentIssueId {
    return this._id;
  }
  get category(): IssueCategory {
    return this._category;
  }
  get description(): string {
    return this._description;
  }
  get priority(): IssuePriority {
    return this._priority;
  }
  get sequenceNo(): number {
    return this._sequenceNo;
  }
}

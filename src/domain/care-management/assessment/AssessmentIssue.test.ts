import { describe, it, expect } from 'vitest';
import { AssessmentIssue } from './AssessmentIssue';
import { AssessmentIssueId } from './AssessmentIssueId';
import { AssessmentValidationError } from './AssessmentValidationError';

describe('AssessmentIssue.create', () => {
  it('creates with valid input and generates a fresh id', () => {
    const issue = AssessmentIssue.create({
      category: 'health',
      description: '膝の痛みあり',
      priority: 'medium',
      sequenceNo: 1,
    });
    expect(issue.category).toBe('health');
    expect(issue.description).toBe('膝の痛みあり');
    expect(issue.priority).toBe('medium');
    expect(issue.sequenceNo).toBe(1);
    expect(issue.id.value).toBeTruthy();
  });

  it('throws on empty description', () => {
    expect(() =>
      AssessmentIssue.create({
        category: 'health',
        description: '   ',
        priority: 'low',
        sequenceNo: 1,
      }),
    ).toThrow(AssessmentValidationError);
  });
});

describe('AssessmentIssue.reconstruct', () => {
  it('reconstructs preserving id', () => {
    const id = new AssessmentIssueId('11111111-2222-3333-4444-555555555555');
    const issue = AssessmentIssue.reconstruct({
      id,
      category: 'adl',
      description: '入浴に介助が必要',
      priority: 'high',
      sequenceNo: 2,
    });
    expect(issue.id.equals(id)).toBe(true);
    expect(issue.priority).toBe('high');
  });
});

describe('AssessmentIssue mutators', () => {
  const make = () =>
    AssessmentIssue.create({
      category: 'health',
      description: '初期説明',
      priority: 'medium',
      sequenceNo: 1,
    });

  it('updateDescription updates description and rejects empty', () => {
    const i = make();
    i.updateDescription('修正済み');
    expect(i.description).toBe('修正済み');
    expect(() => i.updateDescription('  ')).toThrow(AssessmentValidationError);
  });

  it('updateCategory and updatePriority work', () => {
    const i = make();
    i.updateCategory('cognitive');
    i.updatePriority('high');
    expect(i.category).toBe('cognitive');
    expect(i.priority).toBe('high');
  });
});

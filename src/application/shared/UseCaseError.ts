export type UseCaseErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INCONSISTENT_DATA'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class UseCaseError extends Error {
  constructor(
    public readonly code: UseCaseErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UseCaseError';
  }
}

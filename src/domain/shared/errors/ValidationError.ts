import { DomainError } from './DomainError';

export class ValidationError extends DomainError {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

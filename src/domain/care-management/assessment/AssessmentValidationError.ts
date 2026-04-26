import { DomainError } from '@/domain/shared/errors/DomainError';

export class AssessmentValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

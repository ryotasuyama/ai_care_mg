import { DomainError } from '@/domain/shared/errors/DomainError';

export class CarePlanValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

import { DomainError } from '@/domain/shared/errors/DomainError';

export class KnowledgeValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

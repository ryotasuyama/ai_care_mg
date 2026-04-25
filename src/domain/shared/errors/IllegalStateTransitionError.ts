import { DomainError } from './DomainError';

export class IllegalStateTransitionError extends DomainError {
  constructor(
    public readonly from: string,
    public readonly to: string,
    message?: string,
  ) {
    super(message ?? `Cannot transition from '${from}' to '${to}'`);
  }
}

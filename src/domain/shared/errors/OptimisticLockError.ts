import { DomainError } from './DomainError';

export class OptimisticLockError extends DomainError {
  constructor(message = '他のユーザーが同時に更新しました。再読み込みしてください。') {
    super(message);
  }
}

import * as Sentry from '@sentry/nextjs';
import { UseCaseError } from '@/application/shared/UseCaseError';

/**
 * Server Action を Sentry エラー捕捉でラップする。
 * UseCaseError（期待内エラー）は Sentry に送らず、それ以外は captureException する。
 */
export function withSentry<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    try {
      return await action(...args);
    } catch (error) {
      if (!(error instanceof UseCaseError)) {
        Sentry.captureException(error);
      }
      throw error;
    }
  };
}

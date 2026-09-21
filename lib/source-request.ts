import type { Ref } from './history';
import { readServiceJSON, ServiceResponseError } from './service-response';

export const SOURCE_REQUEST_ATTEMPTS = 3;
export type SourceProgress = { attempt: number; retrying: boolean };
export type SourceResponse = { references: Ref[]; exactExamples: number };

function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

// Give each attempt a fresh timeout and keep the serialized filter unchanged.
export async function sourceQuestionsRequest(
  body: string,
  signal: AbortSignal,
  onProgress: (progress: SourceProgress) => void,
  timing = { timeoutMs: 20_000, retryDelayMs: 1_000 },
): Promise<SourceResponse> {
  for (let attempt = 1; attempt <= SOURCE_REQUEST_ATTEMPTS; attempt++) {
    signal.throwIfAborted();
    onProgress({ attempt, retrying: false });
    const timeout = new AbortController();
    const timer = setTimeout(
      () =>
        timeout.abort(
          new DOMException('Source browsing timed out.', 'TimeoutError'),
        ),
      timing.timeoutMs,
    );
    let failure: unknown;
    try {
      const response = await fetch('/api/source-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.any([signal, timeout.signal]),
      });
      if (
        response.status >= 400 &&
        response.status < 500 &&
        ![408, 429].includes(response.status)
      )
        throw new ServiceResponseError(
          response.status === 401 || response.status === 403
            ? 'Source browsing requires access. Refresh the app and check your sign-in.'
            : 'Check the source filters before browsing again.',
          false,
        );
      const data = await readServiceJSON(response, 'Source browsing');
      if (!response.ok)
        throw new ServiceResponseError(
          data.error || `Source browsing failed (HTTP ${response.status}).`,
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
        );
      if (
        !Array.isArray(data?.references) ||
        !Number.isInteger(data.exactExamples)
      )
        throw new ServiceResponseError(
          'Source browsing returned incomplete question data.',
          true,
        );
      signal.throwIfAborted();
      timeout.signal.throwIfAborted();
      return data as SourceResponse;
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timer);
    }
    signal.throwIfAborted();
    const retryable =
      timeout.signal.aborted ||
      (failure instanceof ServiceResponseError
        ? failure.retryable
        : failure instanceof TypeError ||
          (failure as Error)?.name === 'TimeoutError');
    if (!retryable) throw failure;
    if (attempt === SOURCE_REQUEST_ATTEMPTS)
      throw new Error(
        `Source browsing could not complete after ${SOURCE_REQUEST_ATTEMPTS} attempts. Please try again. ${failure instanceof Error ? failure.message : ''}`,
      );
    onProgress({ attempt: attempt + 1, retrying: true });
    await pause(timing.retryDelayMs * attempt, signal);
  }
  throw new Error('Source browsing could not complete.');
}

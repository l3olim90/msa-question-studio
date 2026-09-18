import { ServiceResponseError } from './service-response';
export async function importRequest<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const transient =
      error instanceof ServiceResponseError
        ? error.retryable
        : error instanceof TypeError && error.message === 'fetch failed';
    if (!transient) throw error;
    console.log(
      'The provider connection was interrupted. Retrying this extraction request once.',
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return run();
  }
}

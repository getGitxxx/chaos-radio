/**
 * Retry utility with exponential backoff.
 *
 * Usage:
 *   const result = await withRetry(
 *     () => fetchSomeData(),
 *     { retries: 2, delayMs: 1000 }
 *   );
 */

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry a function with exponential backoff.
 * @param fn - The async function to retry.
 * @param options - Retry configuration.
 * @returns The result of the function.
 * @throws The last error if all retries fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 2, delayMs = 1000, onRetry } = options;

  let lastError: Error = new Error('withRetry: unreachable (no attempts made)');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        const backoffMs = delayMs * Math.pow(2, attempt);
        console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms:`, lastError.message);
        onRetry?.(lastError, attempt + 1);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw lastError;
}

/**
 * Wrap a fetch call with a timeout using AbortController.
 * @param url - The URL to fetch.
 * @param init - Fetch options.
 * @param timeoutMs - Timeout in milliseconds.
 * @returns The fetch response.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

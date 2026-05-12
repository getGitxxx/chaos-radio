export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function createRateLimit(options: RateLimitOptions) {
  return async function rateLimit(request: Request): Promise<{ allowed: boolean; retryAfter?: number }> {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('remote-addr') || 'unknown';
    const now = Date.now();

    const entry = store.get(ip);
    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true };
    }

    if (entry.count >= options.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      };
    }

    entry.count++;
    return { allowed: true };
  };
}

export const rateLimit = createRateLimit({
  maxRequests: 60,
  windowMs: 60 * 1000,
});
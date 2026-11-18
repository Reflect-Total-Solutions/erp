/**
 * In-memory sliding-window rate limiter.
 * Suitable for single-instance deployments (~20 concurrent users).
 * For multi-instance deployments, replace with Redis-based rate limiting.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const cutoff = Date.now() - 15 * 60 * 1000;
      for (const [key, entry] of store.entries()) {
        entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
        if (entry.timestamps.length === 0) store.delete(key);
      }
    },
    5 * 60 * 1000
  );
}

export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum number of requests in the window */
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check if a key (e.g. IP address or email) is within rate limits.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  const allowed = entry.timestamps.length < config.maxRequests;

  if (allowed) {
    entry.timestamps.push(now);
  }

  const oldest = entry.timestamps[0] ?? now;
  const resetAt = new Date(oldest + config.windowMs);

  return {
    allowed,
    remaining: Math.max(0, config.maxRequests - entry.timestamps.length),
    resetAt,
  };
}

/**
 * Inspect whether a key has exceeded the rate limit WITHOUT consuming an attempt.
 */
export function isRateLimited(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  const entry = store.get(key);
  if (!entry) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now + config.windowMs),
    };
  }

  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  if (entry.timestamps.length === 0) {
    store.delete(key);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now + config.windowMs),
    };
  }

  const allowed = entry.timestamps.length < config.maxRequests;
  const oldest = entry.timestamps[0] ?? now;
  return {
    allowed,
    remaining: Math.max(0, config.maxRequests - entry.timestamps.length),
    resetAt: new Date(oldest + config.windowMs),
  };
}

/**
 * Record a failed attempt against a key.
 */
export function recordRateLimitHit(
  key: string,
  config: RateLimitConfig
): void {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  entry.timestamps.push(now);
}

/**
 * Clear rate-limit history for a key (e.g. after successful login).
 */
export function clearRateLimit(key: string): void {
  store.delete(key);
}

/** Login rate limit: 15 failed attempts per 15 minutes per IP + email */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 15,
};

// Soft abuse protection for the public advisory endpoint. The WeatherAI key is
// metered (Free plan: 1,000 requests/month, 5 tree analyses/month), so an
// anonymous visitor must not be able to hammer it.
//
// Two layers:
//   1. A per-IP token bucket — short-burst throttle.
//   2. A global daily cap — backstop so one bad actor cannot drain the month.
//
// Both are in-memory. For multi-instance deployments, back them with the same
// Redis used for caching; the call site (`checkRateLimit`) would not change.

const PER_IP_CAPACITY = 5; // burst size per IP
const PER_IP_REFILL_PER_MIN = 2; // tokens added back per minute
const GLOBAL_DAILY_CAP = 50; // total advisories served per UTC day

type Bucket = { tokens: number; updatedAt: number };

const ipBuckets = new Map<string, Bucket>();
let globalDay = ""; // YYYY-MM-DD currently being counted
let globalCount = 0;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; reason: "per_ip" | "global" };

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();

  // --- Global daily cap. -------------------------------------------------
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== globalDay) {
    globalDay = day;
    globalCount = 0;
  }
  if (globalCount >= GLOBAL_DAILY_CAP) {
    const msUntilMidnight = Date.parse(`${day}T23:59:59.999Z`) - now + 1;
    return { ok: false, retryAfterSec: Math.ceil(msUntilMidnight / 1000), reason: "global" };
  }

  // --- Per-IP token bucket. ----------------------------------------------
  const bucket = ipBuckets.get(ip) ?? { tokens: PER_IP_CAPACITY, updatedAt: now };
  const elapsedMin = (now - bucket.updatedAt) / 60_000;
  bucket.tokens = Math.min(PER_IP_CAPACITY, bucket.tokens + elapsedMin * PER_IP_REFILL_PER_MIN);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    ipBuckets.set(ip, bucket);
    const retryAfterSec = Math.ceil(((1 - bucket.tokens) / PER_IP_REFILL_PER_MIN) * 60);
    return { ok: false, retryAfterSec, reason: "per_ip" };
  }

  bucket.tokens -= 1;
  ipBuckets.set(ip, bucket);
  globalCount += 1;
  return { ok: true };
}

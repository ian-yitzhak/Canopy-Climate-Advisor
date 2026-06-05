// In-memory TTL cache. The interface (get / set / cached) is deliberately tiny
// so the store can be swapped for Upstash Redis or Vercel KV when running on
// more than one instance — call sites would not change.

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();

export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < nowMs()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function set(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: nowMs() + ttlMs });
}

// Memoize an async producer behind the cache. On a hit the producer never runs.
export async function cached<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
  const hit = get<T>(key);
  if (hit !== undefined) return hit;
  const value = await produce();
  set(key, value, ttlMs);
  return value;
}

// Date.now() is fine in server runtime; isolated here so the rest stays pure.
function nowMs(): number {
  return Date.now();
}

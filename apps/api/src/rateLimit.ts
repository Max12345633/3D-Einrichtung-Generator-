/** Einfaches Sliding-Window-Limit pro Schlüssel (IP / später User-ID). Produktion: Redis/Upstash. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  check(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSec: Math.ceil((this.windowMs - (now - recent[0]!)) / 1000) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true, retryAfterSec: 0 };
  }
}

/**
 * A token bucket per key for public room endpoints. Limits stay in this process;
 * a restart resets them. The key map evicts inactive buckets when it grows.
 */
export class TokenBuckets {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly maxKeys = 10_000
  ) {}

  /** True when the key may proceed now; false means it has spent its bucket. */
  take(key: string, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    const refilled = Math.min(
      this.capacity,
      bucket.tokens + (now - bucket.at) * this.refillPerMs
    );
    const allowed = refilled >= 1;
    this.buckets.set(key, {
      tokens: allowed ? refilled - 1 : refilled,
      at: now
    });
    if (this.buckets.size > this.maxKeys) this.evict(now);
    return allowed;
  }

  private evict(now: number): void {
    // Full buckets carry no state worth keeping.
    for (const [key, bucket] of this.buckets) {
      const refilled = bucket.tokens + (now - bucket.at) * this.refillPerMs;
      if (refilled >= this.capacity) this.buckets.delete(key);
    }
  }
}

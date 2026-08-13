// In-memory state for the currently-running Meta upload job.
// Single-process by design — concurrent uploads aren't supported because
// the progress emitter and Meta rate limits make it complex.

let activeUploadPromise: Promise<any> | null = null;
let activeUploadStartedAt: number | null = null;

export const UPLOAD_STALE_AFTER_MS = 15 * 60 * 1000;

export const uploadState = {
  isActive(): boolean {
    return activeUploadPromise !== null;
  },
  getPromise(): Promise<any> | null {
    return activeUploadPromise;
  },
  elapsedMs(): number {
    return activeUploadStartedAt ? Date.now() - activeUploadStartedAt : 0;
  },
  isStale(): boolean {
    if (!activeUploadStartedAt) return false;
    return Date.now() - activeUploadStartedAt > UPLOAD_STALE_AFTER_MS;
  },
  set(promise: Promise<any>): void {
    activeUploadPromise = promise;
    activeUploadStartedAt = Date.now();
  },
  clear(): { wasActive: boolean; elapsedMs: number } {
    const wasActive = activeUploadPromise !== null;
    const elapsedMs = activeUploadStartedAt ? Date.now() - activeUploadStartedAt : 0;
    activeUploadPromise = null;
    activeUploadStartedAt = null;
    return { wasActive, elapsedMs };
  },
};

// ── Meta rate-limit circuit ─────────────────────────────────────────
// Tripped when any Meta call reports a rate-limit code. Upload triggers
// (send-to-meta, send-to-meta-batch, the scheduled-uploads poller,
// recover-uploads' auto-kick) consult this before firing new Meta
// traffic, so the limit window actually expires instead of being held
// open by our own retries.

let rateLimitedUntil: number | null = null;
let rateLimitReason: string | null = null;

export interface RateLimitInfo {
  limitedUntil: string;
  remainingMinutes: number;
  reason: string | null;
}

export const rateLimit = {
  record(retryAfterMinutes: number, reason: string): void {
    const until = Date.now() + retryAfterMinutes * 60 * 1000;
    // Multiple calls can trip the limit; keep the furthest-out estimate.
    if (!rateLimitedUntil || until > rateLimitedUntil) {
      rateLimitedUntil = until;
      rateLimitReason = reason;
    }
  },
  isLimited(): boolean {
    if (rateLimitedUntil === null) return false;
    if (Date.now() >= rateLimitedUntil) {
      rateLimitedUntil = null;
      rateLimitReason = null;
      return false;
    }
    return true;
  },
  info(): RateLimitInfo | null {
    if (!this.isLimited()) return null;
    return {
      limitedUntil: new Date(rateLimitedUntil!).toISOString(),
      remainingMinutes: Math.ceil((rateLimitedUntil! - Date.now()) / 60_000),
      reason: rateLimitReason,
    };
  },
  clear(): void {
    rateLimitedUntil = null;
    rateLimitReason = null;
  },
};

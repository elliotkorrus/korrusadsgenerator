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

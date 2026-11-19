// Zeffy API client with rate-limit handling (20 req/s, 100 req/min).
// The key is only ever sent in the Authorization header; never log it.

export const ZEFFY_BASE = "https://api.zeffy.com/api/v1";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ZeffyClient {
  private last = 0;
  calls = 0; // HTTP requests made, for the run summary
  constructor(private key: string) {}

  // Returns {status, body}. 404 is returned, not thrown.
  async get(path: string): Promise<{ status: number; body: any }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      // 20 req/s ceiling: keep at least 75 ms between calls.
      const gap = Date.now() - this.last;
      if (gap < 75) await sleep(75 - gap);
      this.last = Date.now();
      this.calls++;

      const res = await fetch(`${ZEFFY_BASE}${path}`, {
        headers: { Authorization: `Bearer ${this.key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        const wait = Math.min(Math.max(Number(res.headers.get("retry-after")) || 1, 1), 61);
        await res.body?.cancel();
        await sleep(wait * 1000);
        continue;
      }

      // Slow down before the per-minute window runs dry.
      const remaining = Number(res.headers.get("x-ratelimit-remaining"));
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      if (Number.isFinite(remaining) && remaining <= 2 && Number.isFinite(reset) && reset > 0) {
        const waitMs = Math.min(Math.max(reset * 1000 - Date.now(), 0), 61000);
        if (waitMs > 0) await sleep(waitMs);
      }

      if (res.status === 404) {
        await res.body?.cancel();
        return { status: 404, body: null };
      }
      if (!res.ok) {
        await res.body?.cancel();
        if (res.status >= 500 && attempt < 3) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error(`zeffy_http_${res.status}`);
      }
      return { status: res.status, body: await res.json() };
    }
    throw new Error("zeffy_rate_limited");
  }
}

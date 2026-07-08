import type { Request, Response, NextFunction } from "express";

// Zero-dependency fixed-window rate limiter (per IP). Suitable for a single
// free-tier instance; swap for a shared store if the API ever scales out.
interface Bucket { count: number; resetAt: number }

export function rateLimit({ windowMs = 60_000, max = 60 }: { windowMs?: number; max?: number } = {}) {
  const buckets = new Map<string, Bucket>();

  // Periodically drop expired buckets so the map can't grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || b.resetAt <= now) { b = { count: 0, resetAt: now + windowMs }; buckets.set(ip, b); }
    b.count++;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - b.count)));
    if (b.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };
}

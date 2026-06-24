import { type RequestHandler } from "express";

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

export function fixedWindowRateLimit(limit: number, windowMs: number): RequestHandler {
    const entries = new Map<string, RateLimitEntry>();

    return (request, response, next) => {
        const now = Date.now();
        if (entries.size > 10_000) {
            for (const [entryKey, entryValue] of entries) {
                if (entryValue.resetAt <= now) entries.delete(entryKey);
            }
        }
        const key = request.ip || request.socket.remoteAddress || "unknown";
        const current = entries.get(key);
        const entry = !current || current.resetAt <= now
            ? { count: 0, resetAt: now + windowMs }
            : current;

        entry.count += 1;
        entries.set(key, entry);
        response.setHeader("RateLimit-Limit", limit);
        response.setHeader("RateLimit-Remaining", Math.max(0, limit - entry.count));
        response.setHeader("RateLimit-Reset", Math.ceil(entry.resetAt / 1_000));

        if (entry.count > limit) {
            response.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1_000));
            response.status(429).json({
                success: false,
                error: {
                    type: "RateLimitError",
                    message: "Too many device authorization requests",
                    statusCode: 429,
                },
            });
            return;
        }

        next();
    };
}

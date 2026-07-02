import { type RequestHandler } from "express";

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

export function fixedWindowRateLimit(limit: number, windowMs: number): RequestHandler {
    const entries = new Map<string, RateLimitEntry>();

    return (request, response, next) => {
        const key = request.ip || "unknown";
        const now = Date.now();
        const current = entries.get(key);
        const entry: RateLimitEntry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;

        entry.count += 1;
        entries.set(key, entry);

        response.setHeader("RateLimit-Limit", limit);
        response.setHeader("RateLimit-Remaining", Math.max(0, limit - entry.count));
        response.setHeader("RateLimit-Reset", Math.ceil(entry.resetAt / 1_000));

        if (entry.count > limit) {
            response.status(429).json({
                success: false,
                error: {
                    code: "RATE_LIMITED",
                    message: "Too many requests. Try again later.",
                },
            })
            return;
        }

        next();
    };
}

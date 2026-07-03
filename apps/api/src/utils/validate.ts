import { ZodType } from "zod";
import { ValidationError } from "./api-error.js";

export function validate<T>(schema: ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (result.success) {
        return result.data;
    }
    const message = result.error.issues
        .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
        .join(", ");
    throw new ValidationError(message);
}
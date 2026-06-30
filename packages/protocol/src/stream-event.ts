import z from "zod";

export const TextDeltaEventSchema = z.object({
    type: z.literal("text_delta"),
    text: z.string(),
});

export const ToolCallStartEventSchema = z.object({
    type: z.literal("tool_call_start"),
    id: z.string().min(1),
    name: z.string().min(1),
});

export const ToolCallDeltaEventSchema = z.object({
    type: z.literal("tool_call_delta"),
    id: z.string().min(1),
    argsDelta: z.string(),
});

export const ToolCallEventSchema = z.object({
    type: z.literal("tool_call"),
    id: z.string().min(1),
    name: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
});

export const UsageEventSchema = z.object({
    type: z.literal("usage"),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cachedTokens: z.number().int().nonnegative().default(0),
});

export const ErrorEventSchema = z.object({
    type: z.literal("error"),
    message: z.string().min(1),
    code: z.string().optional(),
    retryable: z.boolean().default(false),
});

export const StopReasonSchema = z.enum([
    "end_turn",
    "tool_use",
    "max_tokens",
    "stop_sequence",
    "error",
]);

export const DoneEventSchema = z.object({
    type: z.literal("done"),
    stopReason: StopReasonSchema,
});

export const ProviderStreamEventSchema = z.discriminatedUnion("type", [
    TextDeltaEventSchema,
    ToolCallStartEventSchema,
    ToolCallDeltaEventSchema,
    ToolCallEventSchema,
    UsageEventSchema,
    ErrorEventSchema,
    DoneEventSchema,
]);

export type TextDeltaEvent = z.infer<typeof TextDeltaEventSchema>;
export type ToolCallStartEvent = z.infer<typeof ToolCallStartEventSchema>;
export type ToolCallDeltaEvent = z.infer<typeof ToolCallDeltaEventSchema>;
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type UsageEvent = z.infer<typeof UsageEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type StopReason = z.infer<typeof StopReasonSchema>;
export type DoneEvent = z.infer<typeof DoneEventSchema>;
export type ProviderStreamEvent = z.infer<typeof ProviderStreamEventSchema>;

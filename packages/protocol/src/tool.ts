import z from "zod";

export const ToolSideEffectSchema = z.object({
    readOnly: z.boolean().default(false),
    destructive: z.boolean().default(true),
    idempotent: z.boolean().default(false),
    requiresNetwork: z.boolean().default(false),
})

export const ToolExecutionTargetSchema = z.enum(["local", "backend", "sandbox"]);

export const ActorSchema = z.object({
    type: z.enum(["user", "main-agent", "sub-agent", "system", "verification"]),
    id: z.string().min(1)
});

export const JsonInputSchema = z.object({
    type: z.enum(["object"]),
    properties: z.record(z.string(), z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional()
})

export const ToolDeclarationSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    jsonSchema: JsonInputSchema,
    sideEffect: ToolSideEffectSchema,
    executionTarget: ToolExecutionTargetSchema.default("local"),
    requiresConfirmation: z.boolean().default(false),
    timeoutMs: z.number().int().positive().optional(),
    version: z.string().default("1"),
});

export const ProviderToolSchema = ToolDeclarationSchema.pick({ name: true, description: true, jsonSchema: true })


export const ToolInvocationSchema = z.object({
    sessionId: z.string().min(1),
    turnId: z.string().min(1),
    toolCallId: z.string().min(1),
    actor: ActorSchema,
    workspaceRoot: z.string().min(1),
    requestedAt: z.iso.datetime(),
});

export const ToolResultStatusSchema = z.enum(["success", "error", "denied", "timeout", "cancelled"]);

export const ToolResultSchema = z.object({
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    status: ToolResultStatusSchema,
    output: z.unknown().optional(),
    content: z.string(),
    isError: z.boolean().default(false),
    durationMs: z.number().int().nonnegative(),
    truncated: z.boolean().default(false),
    resultRef: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});


export const ToolExecutionStartedEventSchema = z.object({ type: z.literal("tool_execution_started"), toolCallId: z.string() })
export const ToolExecutionProgressEventSchema = z.object({ type: z.literal("tool_execution_progress"), toolCallId: z.string(), message: z.string() });
export const ToolExecutionCompletedEventSchema = z.object({ type: z.literal("tool_execution_completed"), toolCallId: z.string(), result: ToolResultSchema });
export const ToolExecutionFailedEventSchema = z.object({ type: z.literal("tool_execution_failed"), toolCallId: z.string(), message: z.string() });
export const ToolConfirmationRequiredEventSchema = z.object({ type: z.literal("tool_confirmation_required"), toolCallId: z.string(), prompt: z.string() });
export const ToolConfirmationResolvedEventSchema = z.object({ type: z.literal("tool_confirmation_resolved"), toolCallId: z.string(), approved: z.boolean() });

export const ToolExecutionEventSchema = z.discriminatedUnion("type", [
    ToolExecutionStartedEventSchema,
    ToolExecutionProgressEventSchema,
    ToolExecutionCompletedEventSchema,
    ToolExecutionFailedEventSchema,
    ToolConfirmationRequiredEventSchema,
    ToolConfirmationResolvedEventSchema
]);

export type ToolExecutionEvent = z.infer<typeof ToolExecutionEventSchema>;

export type ToolSideEffect = z.infer<typeof ToolSideEffectSchema>;
export type ToolExecutionTarget = z.infer<typeof ToolExecutionTargetSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type JsonSchema = z.infer<typeof JsonInputSchema>;
export type ToolDeclaration = z.infer<typeof ToolDeclarationSchema>;
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>;
export type ToolResultStatus = z.infer<typeof ToolResultStatusSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;

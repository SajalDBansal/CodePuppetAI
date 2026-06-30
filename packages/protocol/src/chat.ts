import z from "zod";
import { ProviderToolSchema, ToolDeclarationSchema, ToolResultSchema } from "./tool.js";

export const ProviderIdSchema = z.enum(["openai", "anthropic", "google"]);

export const ChatRoleSchema = z.enum(["system", "user", "assistant", "tool"]);

export const ToolCallSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
});

export const ChatMessageSchema = z.object({
    role: ChatRoleSchema,
    content: z.string().optional(),
    toolCalls: z.array(ToolCallSchema).optional(),
    toolCallId: z.string().optional(),
    name: z.string().optional(),
})

export const ProviderStreamRequestSchema = z.object({
    providerId: ProviderIdSchema,
    modelId: z.string().min(1),
    systemPrompt: z.string().optional(),
    messages: z.array(ChatMessageSchema).min(1),
    tools: z.array(ProviderToolSchema).default([]),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
});

export const InitialTurnRequestSchema = z.object({
    type: z.literal("initial"),
    providerId: ProviderIdSchema,
    credentialId: z.string().min(1),
    modelId: z.string().min(1),
    workspaceRoot: z.string().min(1),
    message: z.string().min(1),
    systemPrompt: z.string().optional(),
    tools: z.array(ToolDeclarationSchema).default([]),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
});

export const ContinuationTurnRequestSchema = z.object({
    type: z.literal("continuation"),
    sessionId: z.string().min(1),
    toolResults: z.array(ToolResultSchema).min(1),
});

export const TurnRequestSchema = z.discriminatedUnion("type", [
    InitialTurnRequestSchema,
    ContinuationTurnRequestSchema,
]);

export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type ChatRole = z.infer<typeof ChatRoleSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ProviderStreamRequest = z.infer<typeof ProviderStreamRequestSchema>;
export type InitialTurnRequest = z.infer<typeof InitialTurnRequestSchema>;
export type ContinuationTurnRequest = z.infer<typeof ContinuationTurnRequestSchema>;
export type TurnRequest = z.infer<typeof TurnRequestSchema>;
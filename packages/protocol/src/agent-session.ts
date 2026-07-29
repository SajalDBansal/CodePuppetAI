import z from "zod";
import { ThinkingLevelSchema, ToolCategorySchema } from "./tool-registry.js";

export const AgentCallModeSchema = z.enum(["ASK", "PLAN", "CODE", "AUTO"]);

export type AgentCallMode = z.infer<typeof AgentCallModeSchema>;

export const StartSessionSchema = z.object({
    providerId: z.string().trim().min(1).max(120),
    modelId: z.string().trim().min(1).max(120),
    credentialLabel: z.string().trim().min(1).max(120),
    mode: AgentCallModeSchema.default("AUTO"),
    thinkingLevel: ThinkingLevelSchema.default("MID"),
    message: z.string().trim().min(1).max(900_000),
    title: z.string().trim().min(1).max(200).optional(),
    systemPrompt: z.string().trim().min(1).max(1000_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
})

export const ContinueSessionToolResultSchema = z.object({
    toolCallId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    category: ToolCategorySchema,
    content: z.string().trim().min(1).max(900_000).optional(),
    isError: z.boolean().optional(),
})

export const ContinueSessionSchema = z.object({
    credentialLabel: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(900_000).optional(),
    toolResults: z.array(ContinueSessionToolResultSchema).min(1).optional(),
    providerId: z.string().trim().min(1).max(120).optional(),
    modelId: z.string().trim().min(1).max(120).optional(),
    mode: AgentCallModeSchema.default("AUTO"),
    thinkingLevel: ThinkingLevelSchema.default("MID"),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
}).refine((data) => Boolean(data.message) || Boolean(data.toolResults), {
    message: "Either message or toolResults must be provided.",
})

export const SessionIdParamsSchema = z.object({
    sessionId: z.uuid(),
})

export type UsageStats = {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
    totalTokens: number;

    inputCost: number;
    outputCost: number;
    totalCost: number;
}

export type ModelUsage = UsageStats & {
    providerId: string;
    modelId: string;
};

export type ProviderUsage = UsageStats & {
    providerId: string;
};

export type SessionUsage = {
    sessionId: string;
    title: string | null;
    status: string;
    createdAt: Date;
    lastMessageAt: Date;

    total: UsageStats;

    byModels: Record<string, ModelUsage>;
    byProviders: Record<string, ProviderUsage>;
};

export type UserUsageResponse = {
    userId: string;

    total: UsageStats;

    byModels: Record<string, ModelUsage>;
    byProviders: Record<string, ProviderUsage>;

    sessions: SessionUsage[];
};

export const emptyUsage = (): UsageStats => ({
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,

    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
});
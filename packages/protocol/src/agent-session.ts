import z from "zod";

export const AgentCallModeSchema = z.enum(["ASK", "PLAN", "CODE", "AUTO"]);

export type AgentCallMode = z.infer<typeof AgentCallModeSchema>;

export const StartSessionSchema = z.object({
    providerId: z.string().trim().min(1).max(120),
    modelId: z.string().trim().min(1).max(120),
    credentialLabel: z.string().trim().min(1).max(120),
    mode: AgentCallModeSchema.default("AUTO"),
    thinkingLevel: z.enum(["INSTANT", "MID", "HIGH"]).default("MID"),
    message: z.string().trim().min(1).max(900_000),
    title: z.string().trim().min(1).max(200).optional(),
    systemPrompt: z.string().trim().min(1).max(1000_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
})
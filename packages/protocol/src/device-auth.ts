import z from "zod";

export const DeviceLoginStartSchema = z.object({
    deviceName: z.string().trim().min(1).max(120).default("Codex CLI"),
})

export const DeviceLoginTokenSchema = z.object({
    deviceCode: z.string().trim().min(1),
})

export const DeviceLoginVerificationSchema = z.object({
    userCode: z.string().trim().min(1),
})

export const DeviceLoginDecisionSchema = z.object({
    userCode: z.string().trim().min(1),
    decision: z.enum(["approve", "deny"]),
})
import z from "zod";

export const HarnessConfigSchema = z.object({
    schemaVersion: z.literal(1).default(1),
    provider: z.string().min(1).default("openai"),
    model: z.string().min(1).default("gpt-5"),
    workspaceRoots: z.array(z.string()).default([]),
    temperature: z.number().min(0).max(2).default(0.2),

    // set according to the provider  selected
    maxOutputTokens: z.number().int().positive().default(8_192),
    maxContextTokens: z.number().int().positive().default(80_000),

    // profile: SandboxProfileSchema.default("workspace"),
    // autoVerify: z.boolean().default(true),
    // rollbackOnFailure: z.boolean().default(false),
    // rollbackOnVerificationFailure: z.boolean().default(false),
    // verification: z.array(VerificationCommandSchema).default([]),
    // budgets: BudgetConfigSchema.default(() => BudgetConfigSchema.parse({})),
    // allowedCommands: z
    //     .array(z.string())
    //     .default([
    //         "git",
    //         "rg",
    //         "fd",
    //         "find",
    //         "ls",
    //         "sed",
    //         "cat",
    //         "wc",
    //         "bun",
    //         "npm",
    //         "pnpm",
    //         "yarn",
    //         "node",
    //         "npx",
    //     ]),
    // allowedNetworkHosts: z.array(z.string()).default([]),
    // e2b: E2BConfigSchema.default(() => E2BConfigSchema.parse({})),
    // memory: MemoryConfigSchema.default(() => MemoryConfigSchema.parse({})),
    // contextFiles: z
    //     .array(z.string())
    //     .default(["AGENTS.md", ".agent-harness/context.md"]),
    // skillDirectories: z.array(z.string()).default([".agent-harness/skills"]),

})

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

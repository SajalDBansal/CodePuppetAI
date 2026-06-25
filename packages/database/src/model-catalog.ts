// model-catalog.ts

export type SeedModel = {
    providerId: string;
    modelId: string;
    displayName: string;
    description: string;
    supportsTools: boolean;
    contextWindow: number;
    maxOutputTokens: number;
    inputCostPer1M: number;
    outputCostPer1M: number;
    active: boolean;
    isDefault: boolean;
};

export const modelCatalogSeed: SeedModel[] = [
    // ============================================================
    // OPENAI
    // ============================================================

    {
        providerId: "openai",
        modelId: "gpt-5.5-pro",
        displayName: "GPT-5.5 Pro",
        description: "OpenAI's highest-end reasoning model for complex coding and long-horizon engineering tasks.",
        supportsTools: true,
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        inputCostPer1M: 30,
        outputCostPer1M: 180,
        active: true,
        isDefault: true,
    },

    {
        providerId: "openai",
        modelId: "gpt-5.5",
        displayName: "GPT-5.5",
        description: "General-purpose OpenAI flagship model suitable for coding, reasoning, and agentic workloads.",
        supportsTools: true,
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        inputCostPer1M: 5,
        outputCostPer1M: 30,
        active: true,
        isDefault: false,
    },

    {
        providerId: "openai",
        modelId: "gpt-5.4",
        displayName: "GPT-5.4",
        description: "High-performance OpenAI reasoning model for software engineering and agent workflows.",
        supportsTools: true,
        contextWindow: 1_050_000,
        maxOutputTokens: 128_000,
        inputCostPer1M: 2.5,
        outputCostPer1M: 15,
        active: true,
        isDefault: false,
    },

    {
        providerId: "openai",
        modelId: "gpt-5.3-codex",
        displayName: "GPT-5.3 Codex",
        description: "OpenAI coding-focused model optimized for software engineering and autonomous coding agents.",
        supportsTools: true,
        contextWindow: 400_000,
        maxOutputTokens: 128_000,
        inputCostPer1M: 1.75,
        outputCostPer1M: 14,
        active: true,
        isDefault: false,
    },

    // ============================================================
    // ANTHROPIC
    // ============================================================

    {
        providerId: "anthropic",
        modelId: "claude-opus-4-7",
        displayName: "Claude Opus 4.7",
        description: "Anthropic's strongest model for advanced software engineering, complex reasoning, and long-running agents.",
        supportsTools: true,
        contextWindow: 1_000_000,
        maxOutputTokens: 128_000,
        inputCostPer1M: 5,
        outputCostPer1M: 25,
        active: true,
        isDefault: true,
    },

    {
        providerId: "anthropic",
        modelId: "claude-opus-4-6",
        displayName: "Claude Opus 4.6",
        description: "High-end Claude reasoning model suited for difficult coding and long-horizon engineering tasks.",
        supportsTools: true,
        contextWindow: 1_000_000,
        maxOutputTokens: 128_000,
        inputCostPer1M: 5,
        outputCostPer1M: 25,
        active: true,
        isDefault: false,
    },

    {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-6",
        displayName: "Claude Sonnet 4.6",
        description: "Balanced Claude model offering strong coding, reasoning, and agentic performance with lower cost than Opus.",
        supportsTools: true,
        contextWindow: 1_000_000,
        maxOutputTokens: 64_000,
        inputCostPer1M: 3,
        outputCostPer1M: 15,
        active: true,
        isDefault: false,
    },

    {
        providerId: "anthropic",
        modelId: "claude-haiku-4-5",
        displayName: "Claude Haiku 4.5",
        description: "Fast and cost-efficient Claude model for coding assistance and high-throughput agent tasks.",
        supportsTools: true,
        contextWindow: 200_000,
        maxOutputTokens: 64_000,
        inputCostPer1M: 1,
        outputCostPer1M: 5,
        active: true,
        isDefault: false,
    },

    // ============================================================
    // GOOGLE
    // ============================================================

    {
        providerId: "google",
        modelId: "gemini-3.1-pro-preview",
        displayName: "Gemini 3.1 Pro Preview",
        description: "Google's advanced reasoning model for complex coding, analysis, and long-context agent workflows.",
        supportsTools: true,
        contextWindow: 1_048_576,
        maxOutputTokens: 65_536,
        inputCostPer1M: 2,
        outputCostPer1M: 12,
        active: true,
        isDefault: true,
    },

    {
        providerId: "google",
        modelId: "gemini-3-pro-preview",
        displayName: "Gemini 3 Pro Preview",
        description: "Advanced Gemini model suitable for software development, reasoning, and multimodal coding workflows.",
        supportsTools: true,
        contextWindow: 1_048_576,
        maxOutputTokens: 65_536,
        inputCostPer1M: 2,
        outputCostPer1M: 12,
        active: true,
        isDefault: false,
    },

    {
        providerId: "google",
        modelId: "gemini-3.5-flash",
        displayName: "Gemini 3.5 Flash",
        description: "Fast Gemini model balancing coding capability, reasoning, tool use, and inference cost.",
        supportsTools: true,
        contextWindow: 1_048_576,
        maxOutputTokens: 65_536,
        inputCostPer1M: 1.5,
        outputCostPer1M: 9,
        active: true,
        isDefault: false,
    },

    {
        providerId: "google",
        modelId: "gemini-2.5-pro",
        displayName: "Gemini 2.5 Pro",
        description: "Strong long-context reasoning model suitable for repository analysis and complex coding tasks.",
        supportsTools: true,
        contextWindow: 1_048_576,
        maxOutputTokens: 65_536,
        inputCostPer1M: 1.25,
        outputCostPer1M: 10,
        active: true,
        isDefault: false,
    },
];
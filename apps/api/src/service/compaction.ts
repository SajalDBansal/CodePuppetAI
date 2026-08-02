import { prisma } from "@workspace/database";
import type { ProviderMessage, ProviderStreamEvent, ProviderToolCall } from "@workspace/protocol";
import { providerRegistry } from "../utils/environment.js";

const COMPACTION_THRESHOLD_RATIO = 0.7;

const TRAILING_RAW_MESSAGES = 6;

type CompactionParams = {
    sessionId: string
    providerId: string
    modelId: string
    apiKey: string
    lastInteractionInputTokens: number
    onEvent: (event: ProviderStreamEvent) => void
}

export async function maybeCompactSession(params: CompactionParams): Promise<void> {
    try {
        const model = await prisma.modelCatalog.findUnique({
            where: { providerId_modelId: { providerId: params.providerId, modelId: params.modelId } },
            select: { contextWindow: true },
        });
        if (!model) return;

        if (params.lastInteractionInputTokens < model.contextWindow * COMPACTION_THRESHOLD_RATIO) {
            return;
        }

        const previousCompaction = await prisma.agentSessionCompaction.findFirst({
            where: { sessionId: params.sessionId },
            orderBy: { coversToSequence: "desc" },
        });

        const candidateMessages = await prisma.agentMessage.findMany({
            where: {
                sessionId: params.sessionId,
                sequence: previousCompaction ? { gt: previousCompaction.coversToSequence } : undefined,
            },
            orderBy: { sequence: "asc" },
            select: { sequence: true, role: true, content: true, toolCalls: true, name: true },
        });

        if (candidateMessages.length <= TRAILING_RAW_MESSAGES) {
            return;
        }

        const toCompact = candidateMessages.slice(0, candidateMessages.length - TRAILING_RAW_MESSAGES);
        const coversToSequence = toCompact[toCompact.length - 1]!.sequence;
        const coversFromSequence = previousCompaction ? previousCompaction.coversFromSequence : toCompact[0]!.sequence;

        const transcript = toCompact.map(formatMessageForSummary).join("\n\n");
        const systemPrompt = buildCompactionSystemPrompt(previousCompaction?.summary);

        params.onEvent({ type: "compaction_started" });

        let summary = "";
        const stream = providerRegistry.stream(
            params.providerId,
            {
                modelId: params.modelId,
                messages: [{ role: "user", content: transcript }],
                systemPrompt,
            },
            { apiKey: params.apiKey },
        );

        for await (const event of stream) {
            if (event.type === "text_delta") {
                summary += event.text;
                params.onEvent({ type: "compaction_delta", text: event.text });
            } else if (event.type === "error") {
                // the real turn should still proceed even if compaction failed - just skip it this time
                return;
            }
        }

        summary = summary.trim();
        if (!summary) return;

        await prisma.agentSessionCompaction.create({
            data: {
                sessionId: params.sessionId,
                summary,
                coversFromSequence,
                coversToSequence,
            },
        });

        params.onEvent({ type: "compaction_completed", coversFromSequence, coversToSequence });
    } catch (error) {
        console.log(error);
    }
}

function formatMessageForSummary(message: {
    sequence: number
    role: string
    content: string | null
    toolCalls: unknown
    name: string | null
}): string {
    if (message.role === "TOOL") {
        return `[seq ${message.sequence}] TOOL RESULT (${message.name ?? "unknown"}): ${message.content ?? "(no content)"}`;
    }
    if (message.toolCalls) {
        return `[seq ${message.sequence}] ${message.role}: called tool(s) ${JSON.stringify(message.toolCalls)}`;
    }
    return `[seq ${message.sequence}] ${message.role}: ${message.content ?? "(no content)"}`;
}

function buildCompactionSystemPrompt(previousSummary?: string): string {
    return `
You are summarizing part of an ongoing AI coding agent session so the conversation can continue without resending the full history.

Write a concise but complete summary covering:
- What the user asked for and why.
- What was investigated, decided, and changed (files touched, commands run, key findings).
- Any open threads, unresolved questions, or next steps still pending.
- Any constraints, conventions, or preferences the user stated that should still apply going forward.
${previousSummary ? `\nThis summary replaces an earlier one, which you must incorporate and supersede rather than ignore:\n\n${previousSummary}\n` : ""}
End with a "Covered ranges:" section listing short bullet points mapping message-sequence ranges to what happened in each (e.g. "- seq 4-9: implemented the auth middleware"), so the range can be looked up for full detail later if needed.

Write plain text only - do not call any tools.
`.trim();
}

export async function loadSessionMessages(sessionId: string): Promise<ProviderMessage[]> {
    const latestCompaction = await prisma.agentSessionCompaction.findFirst({
        where: { sessionId },
        orderBy: { coversToSequence: "desc" },
    });

    const rows = await prisma.agentMessage.findMany({
        where: {
            sessionId,
            sequence: latestCompaction ? { gt: latestCompaction.coversToSequence } : undefined,
        },
        orderBy: { sequence: "asc" },
    });

    const messages: ProviderMessage[] = [];

    if (latestCompaction) {
        messages.push({
            role: "system",
            content: `Summary of the earlier part of this session (covers message sequence ${latestCompaction.coversFromSequence}-${latestCompaction.coversToSequence}). The raw messages still exist and can be fetched with the get_session_messages tool if the exact original content is needed:\n\n${latestCompaction.summary}`,
        });
    }

    for (const row of rows) {
        if (row.role === "USER") messages.push({ role: "user", content: row.content ?? "" });
        else if (row.role === "TOOL") messages.push({ role: "tool", toolCallId: row.toolCallId!, name: row.name!, content: row.content ?? "", isError: row.isError ?? undefined });
        else if (row.role === "SYSTEM") messages.push({ role: "system", content: row.content ?? "" });
        else messages.push({ role: "assistant", content: row.content ?? undefined, toolCalls: (row.toolCalls as ProviderToolCall[] | null) ?? undefined });
    }

    return messages;
}

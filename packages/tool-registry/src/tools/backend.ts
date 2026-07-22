import { ToolDefinition } from "@workspace/protocol";
import z from "zod";
import { truncateOutput } from "../lib/truncate.js";

const getSessionMessagesSchema = z
    .object({
        fromSequence: z.number().int().positive(),
        toSequence: z.number().int().positive(),
    })
    .refine((data) => data.toSequence >= data.fromSequence, {
        message: "toSequence must be greater than or equal to fromSequence.",
    });

export const backendTools: ToolDefinition[] = [
    {
        name: "get_session_messages",
        category: "backend",
        description:
            "Fetches the original, uncompacted messages for a range of this session's message sequence numbers. Use this when a compaction summary references a sequence range and you need the exact original content behind it, not just the summarized version.",
        inputSchema: {
            type: "object",
            properties: {
                fromSequence: { type: "number", description: "The first message sequence number to fetch (inclusive)." },
                toSequence: { type: "number", description: "The last message sequence number to fetch (inclusive)." },
            },
            required: ["fromSequence", "toSequence"],
            additionalProperties: false,
        },
        zodSchema: getSessionMessagesSchema,
        execute: async (args, context) => {
            const parsed = getSessionMessagesSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "\"fromSequence\" and \"toSequence\" must be positive integers with toSequence >= fromSequence." };
            }

            if (!context.session?.getMessages) {
                return { content: "", isError: true, message: "This tool is only available when the API supplies session data access." };
            }

            const { fromSequence, toSequence } = parsed.data;
            const rows = await context.session.getMessages({ fromSequence, toSequence });

            if (rows.length === 0) {
                return { content: "(no messages found in this range)", isError: false, message: `No messages found between sequence ${fromSequence} and ${toSequence}.` };
            }

            const content = truncateOutput(
                rows.map((row) => `Seq ${row.sequence} [${row.role}]: ${row.content ?? "(no text content)"}`).join("\n\n"),
            );

            return { content, isError: false, message: `Fetched ${rows.length} message(s) between sequence ${fromSequence} and ${toSequence}.` };
        },
    },
];

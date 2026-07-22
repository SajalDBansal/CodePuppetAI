import { ToolDefinition } from "@workspace/protocol";
import z from "zod";

const requestConfirmationSchema = z.object({
    prompt: z.string().trim().min(1),
    detail: z.string().trim().min(1).optional(),
});

const askUserSchema = z.object({
    question: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(1).optional(),
});

export const userTools: ToolDefinition[] = [
    {
        name: "request_confirmation",
        category: "user",
        description: "Asks the user for yes/no permission before doing something (e.g. a risky or destructive action) and returns their decision.",
        inputSchema: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "The yes/no question to ask the user." },
                detail: { type: "string", description: "Optional extra context to show alongside the prompt." },
            },
            required: ["prompt"],
            additionalProperties: false,
        },
        zodSchema: requestConfirmationSchema,
        execute: async (args, context) => {
            const parsed = requestConfirmationSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "The \"prompt\" argument must be a non-empty string." };
            }

            if (!context.promptUser) {
                return { content: "", isError: true, message: "No interactive prompt handler is available for this client." };
            }

            const result = await context.promptUser({
                kind: "confirmation",
                prompt: parsed.data.prompt,
                detail: parsed.data.detail,
            });

            if (result.kind !== "confirmation") {
                return { content: "", isError: true, message: "The client returned an unexpected response type for a confirmation prompt." };
            }

            const content = result.approved ? "approved" : `declined${result.reason ? `: ${result.reason}` : ""}`;
            return { content, isError: false, message: result.approved ? "The user approved." : "The user declined." };
        },
    },
    {
        name: "ask_user",
        category: "user",
        description: "Asks the user an open question, optionally with a short list of choices, and returns their answer.",
        inputSchema: {
            type: "object",
            properties: {
                question: { type: "string", description: "The question to ask the user." },
                options: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional list of choices to present instead of free text.",
                },
            },
            required: ["question"],
            additionalProperties: false,
        },
        zodSchema: askUserSchema,
        execute: async (args, context) => {
            const parsed = askUserSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "The \"question\" argument must be a non-empty string." };
            }

            if (!context.promptUser) {
                return { content: "", isError: true, message: "No interactive prompt handler is available for this client." };
            }

            const result = await context.promptUser({
                kind: "question",
                question: parsed.data.question,
                options: parsed.data.options,
            });

            if (result.kind !== "question") {
                return { content: "", isError: true, message: "The client returned an unexpected response type for a question prompt." };
            }

            return { content: result.answer, isError: false, message: "The user answered." };
        },
    },
];

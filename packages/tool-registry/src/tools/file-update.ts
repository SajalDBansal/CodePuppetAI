import { ToolDefinition } from "@workspace/protocol";
import z from "zod";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveWorkspacePathOrError } from "../lib/workspace-path.js";

const MAX_CONTENT_SIZE_BYTES = 5 * 1024 * 1024;

const writeFileSchema = z.object({
    path: z.string().trim().min(1),
    content: z.string().max(MAX_CONTENT_SIZE_BYTES),
});

const editFileSchema = z
    .object({
        path: z.string().trim().min(1),
        oldText: z.string().min(1),
        newText: z.string(),
        replaceAll: z.boolean().optional(),
    })
    .refine((data) => data.oldText !== data.newText, {
        message: "oldText and newText are identical - nothing to change.",
    });

const deleteFileSchema = z.object({
    path: z.string().trim().min(1),
});

export const fileUpdateTools: ToolDefinition[] = [
    {
        name: "write_file",
        category: "file-update",
        description: "Creates a new file or overwrites an existing one with the given content. Creates any missing parent directories.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the file, relative to the workspace root." },
                content: { type: "string", description: "The full content to write to the file." },
            },
            required: ["path", "content"],
            additionalProperties: false,
        },
        zodSchema: writeFileSchema,
        requiresConfirmation: true,
        execute: async (args, context) => {
            const parsed = writeFileSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "\"path\" and \"content\" are required." };
            }

            const resolved = resolveWorkspacePathOrError(context.workspaceRoot, parsed.data.path);
            if (!resolved.ok) {
                return { content: "", isError: true, message: resolved.message };
            }

            let existed = false;
            try {
                const existing = await stat(resolved.resolved);
                if (existing.isDirectory()) {
                    return { content: "", isError: true, message: `"${parsed.data.path}" is a directory, not a file.` };
                }
                existed = true;
            } catch {
                existed = false;
            }

            try {
                await mkdir(dirname(resolved.resolved), { recursive: true });
                await writeFile(resolved.resolved, parsed.data.content, "utf-8");
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Failed to write the file." };
            }

            const action = existed ? "Overwrote" : "Created";
            return {
                content: `${action} "${parsed.data.path}" (${parsed.data.content.length} character(s)).`,
                isError: false,
                message: `${action} "${parsed.data.path}".`,
            };
        },
    },
    {
        name: "edit_file",
        category: "file-update",
        description: "Replaces an exact snippet of text in an existing file with new text. oldText must match exactly once in the file unless replaceAll is set.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the file, relative to the workspace root." },
                oldText: { type: "string", description: "The exact existing text to find and replace." },
                newText: { type: "string", description: "The text to replace it with." },
                replaceAll: { type: "boolean", description: "Replace every occurrence of oldText instead of requiring exactly one match. Defaults to false." },
            },
            required: ["path", "oldText", "newText"],
            additionalProperties: false,
        },
        zodSchema: editFileSchema,
        requiresConfirmation: true,
        execute: async (args, context) => {
            const parsed = editFileSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: parsed.error.issues[0]?.message ?? "\"path\", \"oldText\" and \"newText\" are required." };
            }

            const resolved = resolveWorkspacePathOrError(context.workspaceRoot, parsed.data.path);
            if (!resolved.ok) {
                return { content: "", isError: true, message: resolved.message };
            }

            let fileStat;
            try {
                fileStat = await stat(resolved.resolved);
            } catch {
                return { content: "", isError: true, message: `File not found: "${parsed.data.path}". Use write_file to create a new file.` };
            }
            if (fileStat.isDirectory()) {
                return { content: "", isError: true, message: `"${parsed.data.path}" is a directory, not a file.` };
            }

            let raw: string;
            try {
                raw = await readFile(resolved.resolved, "utf-8");
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Failed to read the file." };
            }

            const { oldText, newText, replaceAll } = parsed.data;
            const occurrences = raw.split(oldText).length - 1;

            if (occurrences === 0) {
                return { content: "", isError: true, message: "oldText was not found in the file." };
            }
            if (occurrences > 1 && !replaceAll) {
                return { content: "", isError: true, message: `oldText appears ${occurrences} times in the file. Make it more specific so it matches exactly once, or pass replaceAll: true.` };
            }

            const updated = replaceAll ? raw.split(oldText).join(newText) : raw.replace(oldText, newText);

            try {
                await writeFile(resolved.resolved, updated, "utf-8");
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Failed to write the file." };
            }

            const replacedCount = replaceAll ? occurrences : 1;
            return {
                content: `Replaced ${replacedCount} occurrence(s) in "${parsed.data.path}".`,
                isError: false,
                message: `Edited "${parsed.data.path}".`,
            };
        },
    },
    {
        name: "delete_file",
        category: "file-update",
        description: "Deletes a file in the workspace. Only deletes files, not directories.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the file, relative to the workspace root." },
            },
            required: ["path"],
            additionalProperties: false,
        },
        zodSchema: deleteFileSchema,
        requiresConfirmation: true,
        execute: async (args, context) => {
            const parsed = deleteFileSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "\"path\" is required." };
            }

            const resolved = resolveWorkspacePathOrError(context.workspaceRoot, parsed.data.path);
            if (!resolved.ok) {
                return { content: "", isError: true, message: resolved.message };
            }

            let fileStat;
            try {
                fileStat = await stat(resolved.resolved);
            } catch {
                return { content: "", isError: true, message: `File not found: "${parsed.data.path}".` };
            }
            if (fileStat.isDirectory()) {
                return { content: "", isError: true, message: `"${parsed.data.path}" is a directory - delete_file only removes files.` };
            }

            try {
                await unlink(resolved.resolved);
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Failed to delete the file." };
            }

            return { content: `Deleted "${parsed.data.path}".`, isError: false, message: `Deleted "${parsed.data.path}".` };
        },
    },
];

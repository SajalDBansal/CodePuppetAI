import { ToolDefinition } from "@workspace/protocol";
import z from "zod";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import { resolveWorkspacePathOrError } from "../lib/workspace-path.js";
import { truncateOutput } from "../lib/truncate.js";

const DEFAULT_IGNORE = [
    "**/node_modules/**",
    "**/.git/**",
    "**/.turbo/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_LIST_ENTRIES = 1000;
const MAX_SEARCH_RESULTS_DEFAULT = 200;
const MAX_FIND_RESULTS = 500;

const listDirectorySchema = z.object({
    path: z.string().trim().min(1),
    recursive: z.boolean().optional(),
    maxDepth: z.number().int().positive().max(10).optional(),
});

const readFileSchema = z.object({
    path: z.string().trim().min(1),
    offset: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(5000).optional(),
});

const searchTextSchema = z.object({
    pattern: z.string().trim().min(1),
    path: z.string().trim().min(1).optional(),
    regex: z.boolean().optional(),
    caseSensitive: z.boolean().optional(),
    maxResults: z.number().int().positive().max(1000).optional(),
});

const findFilesSchema = z.object({
    pattern: z.string().trim().min(1),
    path: z.string().trim().min(1).optional(),
});

export const fileReadTools: ToolDefinition[] = [
    {
        name: "list_directory",
        category: "file-read",
        description: "Lists files and directories under a path in the workspace, optionally recursive.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path relative to the workspace root. Defaults to the workspace root." },
                recursive: { type: "boolean", description: "List nested directories too. Defaults to false (immediate children only)." },
                maxDepth: { type: "number", description: "Max recursion depth when recursive is true. Defaults to 3." },
            },
            required: ["path"],
            additionalProperties: false,
        },
        zodSchema: listDirectorySchema,
        execute: async (args, context) => {
            const parsed = listDirectorySchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "Invalid arguments for list_directory." };
            }

            const resolved = resolveWorkspacePathOrError(context.workspaceRoot, parsed.data.path ?? ".");
            if (!resolved.ok) {
                return { content: "", isError: true, message: resolved.message };
            }

            const recursive = parsed.data.recursive ?? false;

            let entries: string[];
            try {
                entries = await fg("**/*", {
                    cwd: resolved.resolved,
                    dot: true,
                    onlyFiles: false,
                    markDirectories: true,
                    deep: recursive ? (parsed.data.maxDepth ?? 3) : 1,
                    ignore: DEFAULT_IGNORE,
                    suppressErrors: true,
                });
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Failed to list the directory." };
            }

            if (entries.length === 0) {
                return { content: "(empty directory)", isError: false, message: "No entries found." };
            }

            entries.sort();
            const shown = entries.slice(0, MAX_LIST_ENTRIES);
            const omitted = entries.length - shown.length;
            const suffix = omitted > 0 ? `\n... (${omitted} more entries not shown)` : "";

            return {
                content: truncateOutput(shown.join("\n") + suffix),
                isError: false,
                message: `Listed ${shown.length} of ${entries.length} entries.`,
            };
        },
    },
    {
        name: "read_file",
        category: "file-read",
        description: "Reads a text file from the workspace, optionally a specific line range. Returns content with line numbers.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Path to the file, relative to the workspace root." },
                offset: { type: "number", description: "1-indexed line number to start reading from. Defaults to 1." },
                limit: { type: "number", description: "Maximum number of lines to read. Defaults to 2000." },
            },
            required: ["path"],
            additionalProperties: false,
        },
        zodSchema: readFileSchema,
        execute: async (args, context) => {
            const parsed = readFileSchema.safeParse(args);
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
                return { content: "", isError: true, message: `"${parsed.data.path}" is a directory, not a file.` };
            }
            if (fileStat.size > MAX_FILE_SIZE_BYTES) {
                return { content: "", isError: true, message: `File is too large to read (${fileStat.size} bytes, limit is ${MAX_FILE_SIZE_BYTES}). Narrow with offset/limit or use search_text instead.` };
            }

            let raw: string;
            try {
                raw = await readFile(resolved.resolved, "utf-8");
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Failed to read the file." };
            }

            const lines = raw.split("\n");
            const offset = parsed.data.offset ?? 1;
            const limit = parsed.data.limit ?? 2000;
            const startIndex = Math.max(0, offset - 1);

            if (startIndex >= lines.length && lines.length > 0) {
                return { content: "", isError: true, message: `Offset ${offset} is beyond the end of the file (${lines.length} line(s) total).` };
            }

            const slice = lines.slice(startIndex, startIndex + limit);
            const numbered = slice.map((line, i) => `${startIndex + i + 1}\t${line}`).join("\n");
            const remaining = lines.length - (startIndex + slice.length);
            const suffix = remaining > 0 ? `\n... (${remaining} more line(s) not shown, use offset to continue)` : "";

            return {
                content: truncateOutput(numbered + suffix),
                isError: false,
                message: `Read ${slice.length} line(s) of ${lines.length} from "${parsed.data.path}".`,
            };
        },
    },
    {
        name: "search_text",
        category: "file-read",
        description: "Searches file contents under a path for a plain-text or regex pattern and returns matching lines with file:line references.",
        inputSchema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "The text or regex pattern to search for." },
                path: { type: "string", description: "Path to search under, relative to the workspace root. Defaults to the workspace root." },
                regex: { type: "boolean", description: "Treat pattern as a regular expression. Defaults to false (plain substring match)." },
                caseSensitive: { type: "boolean", description: "Case-sensitive matching. Defaults to false." },
                maxResults: { type: "number", description: "Maximum number of matching lines to return. Defaults to 200." },
            },
            required: ["pattern"],
            additionalProperties: false,
        },
        zodSchema: searchTextSchema,
        execute: async (args, context) => {
            const parsed = searchTextSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "\"pattern\" is required." };
            }

            const resolved = resolveWorkspacePathOrError(context.workspaceRoot, parsed.data.path ?? ".");
            if (!resolved.ok) {
                return { content: "", isError: true, message: resolved.message };
            }

            const caseSensitive = parsed.data.caseSensitive ?? false;
            let matcher: (line: string) => boolean;
            if (parsed.data.regex) {
                let pattern: RegExp;
                try {
                    pattern = new RegExp(parsed.data.pattern, caseSensitive ? "" : "i");
                } catch (error) {
                    return { content: "", isError: true, message: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}` };
                }
                matcher = (line) => pattern.test(line);
            } else {
                const needle = caseSensitive ? parsed.data.pattern : parsed.data.pattern.toLowerCase();
                matcher = (line) => (caseSensitive ? line : line.toLowerCase()).includes(needle);
            }

            const maxResults = parsed.data.maxResults ?? MAX_SEARCH_RESULTS_DEFAULT;

            let files: string[];
            try {
                files = await fg("**/*", { cwd: resolved.resolved, dot: true, onlyFiles: true, ignore: DEFAULT_IGNORE, suppressErrors: true });
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Failed to search the given path." };
            }

            const matches: string[] = [];
            for (const relativeFile of files) {
                if (matches.length >= maxResults) break;

                let raw: string;
                try {
                    const absoluteFile = join(resolved.resolved, relativeFile);
                    const fileStat = await stat(absoluteFile);
                    if (fileStat.size > MAX_FILE_SIZE_BYTES) continue;
                    raw = await readFile(absoluteFile, "utf-8");
                } catch {
                    continue;
                }

                const lines = raw.split("\n");
                for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
                    const line = lines[i] ?? "";
                    if (matcher(line)) {
                        matches.push(`${relativeFile}:${i + 1}: ${line.trim()}`);
                    }
                }
            }

            if (matches.length === 0) {
                return { content: "(no matches found)", isError: false, message: `No matches for "${parsed.data.pattern}".` };
            }

            return {
                content: truncateOutput(matches.join("\n")),
                isError: false,
                message: `Found ${matches.length} matching line(s)${matches.length >= maxResults ? " (maxResults reached)" : ""}.`,
            };
        },
    },
    {
        name: "find_files",
        category: "file-read",
        description: "Finds files under a path whose names match a glob pattern (e.g. \"**/*.test.ts\").",
        inputSchema: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Glob pattern to match file names against." },
                path: { type: "string", description: "Path to search under, relative to the workspace root. Defaults to the workspace root." },
            },
            required: ["pattern"],
            additionalProperties: false,
        },
        zodSchema: findFilesSchema,
        execute: async (args, context) => {
            const parsed = findFilesSchema.safeParse(args);
            if (!parsed.success) {
                return { content: "", isError: true, message: "\"pattern\" is required." };
            }

            const resolved = resolveWorkspacePathOrError(context.workspaceRoot, parsed.data.path ?? ".");
            if (!resolved.ok) {
                return { content: "", isError: true, message: resolved.message };
            }

            let files: string[];
            try {
                files = await fg(parsed.data.pattern, { cwd: resolved.resolved, dot: true, onlyFiles: true, ignore: DEFAULT_IGNORE, suppressErrors: true });
            } catch (error) {
                return { content: "", isError: true, message: error instanceof Error ? error.message : "Invalid glob pattern." };
            }

            if (files.length === 0) {
                return { content: "(no files found)", isError: false, message: `No files matched "${parsed.data.pattern}".` };
            }

            files.sort();
            const shown = files.slice(0, MAX_FIND_RESULTS);
            const omitted = files.length - shown.length;
            const suffix = omitted > 0 ? `\n... (${omitted} more file(s) not shown, narrow the pattern)` : "";

            return {
                content: truncateOutput(shown.join("\n") + suffix),
                isError: false,
                message: `Found ${files.length} file(s) matching "${parsed.data.pattern}".`,
            };
        },
    },
];

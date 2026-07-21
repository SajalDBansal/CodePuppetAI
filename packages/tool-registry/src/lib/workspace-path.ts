import { resolve, sep } from "node:path";

export class WorkspacePathEscapeError extends Error {
    constructor(path: string) {
        super(`Path "${path}" resolves outside the workspace root.`);
        this.name = "WorkspacePathEscapeError";
    }
}

export function resolveWorkspacePath(root: string, path: string): string {
    const resolvedRoot = resolve(root);
    const resolvedPath = resolve(resolvedRoot, path);

    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
        throw new WorkspacePathEscapeError(path);
    }

    return resolvedPath;
}

export type ResolvedWorkspacePath = { ok: true, resolved: string } | { ok: false, message: string };

// Non-throwing wrapper around resolveWorkspacePath, for tools that need the
// "no workspaceRoot configured" / "path escapes the workspace" checks to fold
// naturally into their own { isError, message } ToolResult contract.
export function resolveWorkspacePathOrError(workspaceRoot: string | undefined, path: string): ResolvedWorkspacePath {
    if (!workspaceRoot) {
        return { ok: false, message: "No workspace root is configured for this session." };
    }
    try {
        return { ok: true, resolved: resolveWorkspacePath(workspaceRoot, path) };
    } catch (error) {
        return { ok: false, message: error instanceof WorkspacePathEscapeError ? error.message : "Failed to resolve the given path." };
    }
}

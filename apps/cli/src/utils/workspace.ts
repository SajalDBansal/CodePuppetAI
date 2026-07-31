import path from "node:path";
import { harness } from "./context.js";
import { CliUsageError } from "./error.js";

// Picks which of the config's registered workspace roots applies to the
// current directory - mirrors hook.ts's own check (which already guarantees
// the cwd is within one of them before any command runs), so a repo checked
// out under a registered root always resolves to that root rather than
// whichever one happens to be first.
export async function resolveActiveWorkspaceRoot(): Promise<string> {
    const config = await harness.config.get();
    if (!config) {
        throw new CliUsageError("Run 'code-puppet init' first.");
    }

    const cwd = path.resolve(process.cwd());
    const matching = config.workspaceRoots.find((root) => isWithin(cwd, path.resolve(root)));
    return matching ?? config.workspaceRoots[0] ?? cwd;
}

function isWithin(target: string, root: string): boolean {
    const relative = path.relative(root, target);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

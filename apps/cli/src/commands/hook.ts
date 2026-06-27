import { AuthFile } from "@workspace/harness";
import { authStore, configStore, vaultStore } from "../utils/harness-config.js";
import { AuthenticationError, HarnessError } from "../utils/error.js";
import { logger } from "../utils/logger.js";
import path from "node:path";
import inquirer from "inquirer";

export async function preHookCheck(): Promise<{
    authenticated: boolean, configInitialized: boolean
}> {
    let authenticated = false;
    try {
        const active = await session();
        authenticated = Boolean(await vaultStore.getToken(active.user.id))
    } catch (error) {
        authenticated = false
    }

    let configInitialized = false;
    try {
        configInitialized = await configStore.check();
    } catch (error) {
        configInitialized = false
    }

    return { authenticated, configInitialized }
}

export async function checkWorkspaceTrust(cwd: string): Promise<void> {
    const config = await configStore.get();
    if (!config) return;

    const target = path.resolve(cwd);
    const trusted = config.workspaceRoots.some((root) =>
        isWithin(target, path.isAbsolute(root) ? root : path.resolve(root))
    );
    if (trusted) return;

    const { trust } = await inquirer.prompt([
        {
            type: "confirm",
            name: "trust",
            message: `"${target}" is not in your workspace access list. Trust this path and add it?`,
            default: false,
        },
    ]);

    if (!trust) {
        throw new HarnessError(`Path "${target}" was not trusted. Exiting.`, "WORKSPACE_NOT_TRUSTED", 6);
    }

    await configStore.set({ ...config, workspaceRoots: [...config.workspaceRoots, target] });
    logger.success(`Added "${target}" to your workspace access list.`);
}

function isWithin(target: string, root: string): boolean {
    const relative = path.relative(root, target);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}


async function session(): Promise<AuthFile> {
    let value: AuthFile | null = null;
    try {
        value = await authStore.get();
    } catch (error) {
        throw new AuthenticationError();
    }
    if (!value) throw new AuthenticationError();
    if (await authStore.isSessionExpired()) {
        throw new AuthenticationError("CLI login expired. Run 'deepmind login'.")
    }
    return value;
}
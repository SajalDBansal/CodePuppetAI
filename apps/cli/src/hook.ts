import { Command } from "commander";
import { harness, logger } from "./utils/context.js";
import { AuthenticationRequiredError } from "@workspace/harness";
import path from "node:path";
import inquirer from "inquirer";
import { WorkspaceAccessRequiredError } from "./utils/error.js";

const AUTH_EXEMPT_COMMANDS = new Set(["login", "logout", "status", "doctor"]);
const CONFIG_EXEMPT_COMMANDS = new Set(["login", "logout", "status", "doctor", "init"]);

export function installPrehooks(program: Command): void {
    program.hook("preAction", async (_root, command) => {
        const commandName = command.name();

        if (!AUTH_EXEMPT_COMMANDS.has(commandName)) {
            const authenticated = await harness.auth.isAuthenticated();
            if (!authenticated) throw new AuthenticationRequiredError()
        }

        if (!CONFIG_EXEMPT_COMMANDS.has(commandName)) {
            const config = await harness.config.get();
            if (!config) throw new AuthenticationRequiredError()

            const workspaceRoot = path.resolve(process.cwd());
            const hasRootAccess = config.workspaceRoots.some((root) => isWithin(workspaceRoot, path.resolve(root)));

            if (!hasRootAccess) {
                const answer = await inquirer.prompt<{ confirmed: boolean }>([
                    {
                        type: "confirm",
                        name: "confirmed",
                        message: `${workspaceRoot} is not registered for agent access. Add this repository?`,
                        default: false
                    }
                ])

                if (!answer.confirmed) {
                    throw new WorkspaceAccessRequiredError(workspaceRoot);
                }

                await harness.config.addWorkspaceRoot(workspaceRoot);
                logger.success(`Added ${workspaceRoot} to the agent workspaceRoot access list`);
            }
        }
    })
}

function isWithin(target: string, root: string): boolean {
    const relative = path.relative(root, target)
    return (
        relative === "" ||
        (relative !== ".." &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative))
    )
}
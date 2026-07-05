import { Command } from "commander";
import { apiUrl, ENV_CONFIG, harness, logger } from "../utils/context.js";
import inquirer from "inquirer";
import { hostname, platform } from "node:os";
import open from "open"
import { HarnessApiError } from "@workspace/harness";
import { CliUsageError } from "../utils/error.js";


export function accountCommand(program: Command) {
    program
        .command("login")
        .description("Sign in through the browser using device authorization")
        .option("--no-open", "do not open the verification page in a browser")
        .action(async (options: { open: boolean }) => {
            const existing = await harness.auth.get();
            if (existing && (await harness.auth.isAuthenticated())) {
                const answer = await inquirer.prompt<{ replace: boolean }>([
                    {
                        type: "confirm",
                        name: "replace",
                        message: `Replace the session for ${existing.user.email}?`,
                        default: false
                    }
                ])
                if (!answer.replace) {
                    logger.info("Login was left unchanged.");
                    return;
                }
            }

            logger.step("Starting device login...");
            const login = await harness.api.startDeviceLogin(`${ENV_CONFIG.AGENT_NAME}:${hostname()}:${platform()}`);
            logger.heading("Authorize this device");
            logger.keyValue("Code", login.userCode);
            logger.keyValue("URL", login.verificationUri);

            if (options.open) {
                try {
                    await open(login.verificationUriComplete)
                    logger.info("The verification page was opened in your browser");
                } catch {
                    logger.warn("The browser could not be opened. Use the URL above.");
                }
            }

            logger.step("Waiting for approval...");
            const token = await waitForDeviceApproval(login);
            const user = await harness.api.getCurrentUser(token.accessToken);
            await harness.auth.set({
                schemaVersion: 1,
                apiUrl: apiUrl,
                accessToken: token.accessToken,
                tokenType: token.tokenType,
                expiresAt: new Date(Date.now() + token.expiresIn * 1_000).toISOString(),
                user
            })

            logger.success(`Signed in as ${user.name} (${user.email}).`)
            logger.info("Run 'codex-agent init' to configure this workspace.")
        })

    program
        .command("logout")
        .description("Sign out and remove the local device session")
        .option("-f, --force", "skip the confirmation prompt")
        .action(async (options: { force?: boolean }) => {
            const auth = await harness.auth.get()
            if (!auth) {
                logger.info("No local login was found.")
                return
            }
            if (!options.force) {
                const answer = await inquirer.prompt<{ confirmed: boolean }>([
                    {
                        type: "confirm",
                        name: "confirmed",
                        message: `Sign out ${auth.user.email}?`,
                        default: true,
                    },
                ])
                if (!answer.confirmed) {
                    logger.info("Logout was cancelled.")
                    return
                }
            }

            try {
                if (await harness.auth.isAuthenticated()) {
                    await harness.api.logout();
                }
            } catch (error) {
                logger.debug(`Remote logout failed: ${String(error)}`)
                logger.warn("The backend session could not be revoked; clearing local login.")
            }
            await harness.auth.clear()
            logger.success("Signed out and removed the local device session.")
        })

}


async function waitForDeviceApproval(login: {
    deviceCode: string,
    expiresIn: number,
    interval: number
}) {
    const expiresAt = Date.now() + login.expiresIn * 1_000;
    let intervalMs = Math.max(1, login.interval) * 1_000;

    while (Date.now() < expiresAt) {
        await delay(intervalMs);
        try {
            return await harness.api.exchangeDeviceToken(login.deviceCode);
        } catch (error) {
            if (!(error instanceof HarnessApiError)) throw error;
            const code = error.code?.toLowerCase()
            const message = error.message.toLowerCase()
            if (
                code === "authorization_pending" ||
                message.includes("authorization pending") ||
                message.includes("authorization_pending")
            ) {
                continue
            }
            if (
                code === "slow_down" ||
                message.includes("slow down") ||
                message.includes("slow_down")
            ) {
                intervalMs += 5_000
                continue
            }
            if (
                code === "access_denied" ||
                message.includes("access_denied") ||
                message.includes("denied")
            ) {
                throw new CliUsageError("Device login was denied.")
            }
            if (
                code === "expired_token" ||
                message.includes("expired_token") ||
                message.includes("expired")
            ) {
                break
            }
            throw error

        }
    }
    throw new CliUsageError("The device login request expired. Run login again.")
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
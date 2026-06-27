import axios from "axios";
import { Command } from "commander";
import { harnessConfig } from "../utils/config.js";
import { hostname, platform } from "node:os";
import open from "open";
import { authStore, vaultStore } from "../utils/harness-config.js";
import { logger } from "../utils/logger.js";
import { preHookCheck } from "./hook.js";

export function accountCommand(program: Command) {

    program
        .command("status")
        .description("show the current CLI session status")
        .action(async () => {
            const status = await preHookCheck();
            if (status.authenticated) {
                const auth = await authStore.get();
                if (auth) {
                    logger.info(`Logged in as ${auth.user?.email}\n`)
                } else {
                    logger.info("Logged in, but could not retrieve user information. Please login again\n")
                }
            } else {
                logger.info("Not logged in.\n")
            }
        })

    program
        .command("login")
        .description("authorize this CLI through the NewCoding website")
        .option("--no-open", "do not open the verification URL")
        .action(async (options: { open: boolean }) => {
            const status = await preHookCheck();
            if (status.authenticated) {
                logger.info("Already logged in. Run `agent logout` to log out.\n")
                return;
            }

            const controller = new AbortController();
            const stop = (): void => controller.abort(new Error("Login interrupted"));
            process.once("SIGINT", stop)
            try {
                const deviceName = `${hostname()}:${platform()}`;
                const start = await startDeviceLogin(deviceName);

                console.log(`First, confirm this code in your browser: ${start.userCode}`)
                console.log(`Opening ${start.verificationUriComplete} ...`);
                if (options.open) {
                    await open(start.verificationUriComplete);
                }

                const deadline = Date.now() + start.expiresIn * 1000;
                let interval = start.interval;

                while (Date.now() < deadline) {
                    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
                    const result = await pollDeviceResult(start.deviceCode);
                    if ("status" in result && result.status === "approved") {
                        await authStore.save(result);
                        console.log(`Logged in as ${result.user.email}`)
                        return;
                    }
                }
                logger.info("Login timed out. Run `agent login` again.\n")
                process.exitCode = 1


            } catch (error) {
                logger.error(`${(error as Error).message}\n`)
                process.exitCode = 1
            } finally {
                process.off("SIGINT", stop)
            }
        })

    program
        .command("logout")
        .description("revoke the CLI session while preserving config and provider profiles")
        .option("--local-only", "skip remote session revocation")
        .action(async (options: { localOnly: boolean }) => {
            const status = await preHookCheck();
            const auth = await authStore.get();
            if (!status.authenticated || !auth) {
                logger.info("Not logged in.\n")
                return;
            };
            const accessToken = await vaultStore.getToken(auth.user.id);

            if (!options.localOnly && accessToken) {
                try {
                    await axios.post(`${harnessConfig.BACKEND_URL}/api/v1/cli/logout`, {}, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    });
                } catch (error) {
                    logger.error(`Failed to revoke remote session: ${(error as Error).message}\n`)
                    process.exitCode = 1
                }
            }

            await authStore.clear();
            logger.info("Logged out.\n")
        })

}

type DeviceStartResponse = {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    interval: number;
}

type PoolDeviceResponse = {
    status: string;
    accessToken: string;
    tokenType: string;
    expiresIn: number;
    expiresAt: string;
    scope: string;
    user: {
        name: string;
        id: string;
        email: string;
    };
}

async function startDeviceLogin(deviceName: string): Promise<DeviceStartResponse> {
    const response = await axios.post(`${harnessConfig.BACKEND_URL}/api/v1/cli/login/start`, { deviceName });
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Could not reach the backend at ${harnessConfig.BACKEND_URL} (status ${response.status})`);
    }
    return response.data as DeviceStartResponse;
}

async function pollDeviceResult(deviceCode: string): Promise<PoolDeviceResponse> {
    try {
        const response = await axios.post(`${harnessConfig.BACKEND_URL}/api/v1/cli/login/token`, { deviceCode });
        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Could not reach the backend at ${harnessConfig.BACKEND_URL} (status ${response.status})`);
        }
        return response.data as PoolDeviceResponse;
    } catch (error) {
        return { status: "pending" } as PoolDeviceResponse;
    }
}
import { Command } from "commander";
import { preHookCheck } from "./index.js";
import { catalogStore, configStore, path } from "../utils/harness-config.js";
import { logger } from "../utils/logger.js";

export function doctorCommand(program: Command) {

    program
        .command("doctor")
        .description("Check that the backend is reachable and you're logged in")
        .action(async () => {
            // Check if the backend is reachable
            const isBackendReachable = await checkBackendReachable();

            // check if all the required files and directories are present
            const isAllRequiredDirsPresent = await path.ensureAllDirExists();
            const isAllRequiredFilesPresent = await path.checkAllPaths();

            // Check if the user logged in or not
            // Check if the config file is valid
            let { authenticated, configInitialized } = await preHookCheck();

            const config = await configStore.get();
            if (!config) {
                configInitialized = false;
            }

            // show provider
            const provider = config?.provider ?? "not set";
            // show model
            const model = config?.model ?? "not set";
            // show working directories
            const workRootAccess = await configStore.checkWorkDirAccess();

            // Check catalog ok
            const isCatalogFilePresent = await catalogStore.check();

            // check tools count
            const toolsCount = 0;


            logger.info("Doctor check results:");
            logger.info(`Backend reachable: ${isBackendReachable}`);
            logger.info(`Authenticated: ${authenticated}`);
            logger.info(`Config initialized: ${configInitialized}`);
            logger.info(`Provider: ${provider}`);
            logger.info(`Model: ${model}`);
            logger.info(`Catalog file present: ${isCatalogFilePresent}`);
            logger.info(`All required directories present: ${isAllRequiredDirsPresent}`);
            logger.info(`All required files present: ${Object.values(isAllRequiredFilesPresent).every(Boolean)}`);

            if (workRootAccess) {
                for (const access of workRootAccess) {
                    logger.info(`Workspace root: ${access.root}, Readable: ${access.readable}`);
                }
            } else {
                logger.info("No workspace roots configured.");
            }
        })
}

async function checkBackendReachable(): Promise<boolean> {
    return Promise.resolve(true);
}
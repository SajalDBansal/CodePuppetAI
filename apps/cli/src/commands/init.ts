import { Command } from "commander";
import { catalogStore, configStore, path } from "../utils/harness-config.js";
import { logger } from "../utils/logger.js";

export function initCommand(program: Command) {
    program
        .command("init")
        .description("download backend defaults into local config")
        .option("-f, --force", "replace an existing or corrupt local config")
        .action(async (options: { force?: boolean }) => {
            await path.ensureAllDirExists();

            // check auth file
            const authFileExists = await path.checkAuthFileExists();

            // check config file
            const configFileExists = await path.checkConfigFileExists();

            // check catalog file
            const catalogFileExists = await path.checkCatalogFileExists();

            if (!authFileExists) {
                console.log("Authentication file does not exist. Please run 'deepmind login' to authenticate.");
                return;
            }

            if (authFileExists && configFileExists && catalogFileExists && !options.force) {
                console.log("All files already exist. Use --force to overwrite.");
                return;
            }

            // download config file
            if (!configFileExists || options.force) {
                console.log("Downloading config file...");
                await configStore.setDefault(process.cwd());
                console.log("Config file downloaded successfully.");
            }

            // download catalog file
            if (!catalogFileExists || options.force) {
                console.log("Downloading catalog file...");
                await catalogStore.setDefault();
                console.log("Catalog file downloaded successfully.");
            }

            logger.success("Initialization complete. All necessary files are in place.");

        })

}

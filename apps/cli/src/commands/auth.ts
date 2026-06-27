import { Command } from "commander";
import { catalogStore, configStore, vaultStore } from "../utils/harness-config.js";
import { logger } from "../utils/logger.js";
import inquirer from "inquirer";

export function authCommand(program: Command) {
    const command = program
        .command("auth")
        .description("Manage AI providers authentication keys")
        .action(async () => {
            const credentials = await vaultStore.getAllCredentialsMetadata();
            logger.info(`You have ${credentials.length} registered API key(s). Use 'agent auth show' to view them.`);
        })

    command
        .command("show")
        .description("show the current registered api keys")
        .action(async () => {
            const credentials = await vaultStore.getAllCredentialsMetadata();
            logger.info(`You have ${credentials.length} registered API key(s):`);
            const tableData = credentials.map((credential) => ({
                Provider: credential.providerId,
                Tag: credential.tag,
                updatedAt: new Date(credential.updatedAt).toLocaleString(),
            }))
            console.table(tableData);
        })

    command
        .command("set")
        .description("register an api key for the given provider")
        .action(async () => {
            await setProviderCredential();
        });

    command
        .command("remove")
        .description("delete the registered api key for the given provider")
        .option("-a, --all", "replace an existing or corrupt local config")
        .action(async (options: { all?: boolean }) => {
            await removeProviderCredential(options.all);
        });
}

async function setProviderCredential(): Promise<void> {
    const config = await configStore.get();
    if (!config) {
        logger.error("No configuration found. Run 'agent init' first.");
        return;
    }

    const providers = await catalogStore.getProvidersList();
    if (providers.length === 0) {
        logger.error("No providers found in the catalog. Run 'agent init' first.");
        return;
    }

    const { providerId, tag, apiKey } = await inquirer.prompt([
        {
            type: "select",
            name: "providerId",
            message: "Select a provider:",
            choices: providers.map((provider) => ({ name: provider.name, value: provider.id })),
            default: config.provider,
        },
        {
            type: "input",
            name: "tag",
            message: "Give a tag to your api key(this will help you identify it):",
            validate: (input) => {
                if (input.trim() === "") {
                    return "Tag should not be empty"
                }
                return true;
            }
        },
        {
            type: "password",
            name: "apiKey",
            message: "Write your apikey: ",
            mask: "*"
        },
    ]);

    const keyDetails = await vaultStore.setCredential(providerId, tag, apiKey);
    logger.success(`API key for provider '${providerId}' with tag '${tag}' has been registered successfully.`);
}

async function removeProviderCredential(all?: boolean): Promise<void> {
    if (all) {
        const count = await vaultStore.deleteAllCredentials();
        logger.success(`All ${count} API keys have been deleted successfully.`);
        return;
    }

    const credentials = await vaultStore.getAllCredentialsMetadata();
    if (credentials.length === 0) {
        logger.info("No API keys found to delete.");
        return;
    }

    const { credentialId } = await inquirer.prompt([
        {
            type: "select",
            name: "credentialId",
            message: "Select an API key to delete:",
            choices: credentials.map((credential) => ({
                name: `Provider: ${credential.providerId}, Tag: ${credential.tag}`,
                value: credential.id,
            })),
        },
    ]);

    await vaultStore.deleteCredential(credentialId);
    const deletedCredential = credentials.find((credential) => credential.id === credentialId);
    if (!deletedCredential) {
        logger.error("Failed to find the deleted credential details.");
        return;
    }
    const { providerId, tag } = deletedCredential;
    logger.success(`API key with provider '${providerId}' with tag '${tag}' has been deleted successfully.`);
}
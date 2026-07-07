import { Command } from "commander";
import { harness, logger } from "../utils/context.js";
import { CliUsageError } from "../utils/error.js";
import { CatalogProvider, HarnessConfig } from "@workspace/harness";
import inquirer from "inquirer";


export function configCommand(program: Command) {
    const config = program
        .command("config")
        .description("Show or update the stored CLI configuration")
        .action(async () => await showConfig())

    config
        .command("show")
        .description("Show or update the stored CLI configuration")
        .action(async () => await showConfig())

    config
        .command("get")
        .description("Show or update the stored CLI configuration")
        .action(async () => await getConfig())

    config
        .command("set")
        .description("Show or update the stored CLI configuration")
        .action(async () => await setConfig())

}

async function showConfig() {
    const config = await requireConfig();
    logger.heading("Current configuration");
    logger.table(
        ["key", "value"],
        Object.entries(config).map(([key, value]) => [key, key === "selectedCredentials" ? "--confidential--" : formatObjectValue(value),])
    )
}

async function getConfig() {
    const config = await requireConfig();
    const selectedKey = await chooseConfigKey(config);
    const value = config[selectedKey as keyof HarnessConfig];
    logger.heading(`Configuration: ${selectedKey}`);
    logger.plain(`${selectedKey}: ${JSON.stringify(value, null, 2)}`);
}

async function setConfig() {
    const config = await requireConfig();
    const selectedKey = await chooseConfigKey(config);

    if (selectedKey === "providerId") {
        await changeProvider(config)
        return
    }
    if (selectedKey === "modelId") {
        await changeModel(config)
        return
    }

    if (selectedKey === "initializedAt" || selectedKey === "updatedAt" || selectedKey === "schemaVersion" || selectedKey === "apiUrl") {
        throw new CliUsageError("You are not allowed to chnage these properties");
    }

    if (selectedKey === "selectedCredentials") {
        throw new CliUsageError("Use the 'code-puppet auth' commands to update this configuration");
    }

    const currentValue = config[selectedKey];

    const answer = await inquirer.prompt<{ value: unknown }>([
        {
            type: "input",
            name: "value",
            message: `Update the vaue for ${selectedKey} in the config`,
            default: currentValue
        }
    ])

    if (selectedKey === "workspaceRoots") {
        const newRoots = config.workspaceRoots.push(answer.value as string);
        await harness.config.set(config)
        logger.success(`updated the ${selectedKey}'s value successfully`);
    }

}

async function requireConfig(): Promise<HarnessConfig> {
    const config = await harness.config.get()
    if (!config) {
        throw new CliUsageError("No configuration was found. Run 'code-puppet init' first.")
    }
    return config
}

async function loadCatalogProviders(): Promise<CatalogProvider[]> {
    const catalog = await harness.catalog.get();
    if (!catalog) {
        throw new CliUsageError("No provider catalog is cached. Run 'code-puppet init' first.");
    }
    return catalog.providers;
}

function formatObjectValue(value: unknown) {
    if (value === null || value === undefined) {
        return value as null | undefined
    }

    if (typeof value === "object") {
        return JSON.stringify(value, null, 2)
    }

    return String(value)
}

async function chooseConfigKey(config: HarnessConfig): Promise<keyof HarnessConfig> {
    const { selectedKey } = await inquirer.prompt<{ selectedKey: keyof HarnessConfig }>([
        {
            type: "select",
            name: "selectedKey",
            message: "Select the key to fetch the details",
            choices: Object.keys(config)
        }
    ])
    return selectedKey;
}

async function changeProvider(config: HarnessConfig) {
    const providers = await loadCatalogProviders();
    const { providerId } = await inquirer.prompt<{ providerId: string }>([
        {
            type: "select",
            name: "providerId",
            message: "Select the default provider for the config.",
            choices: providers.map((provider) => ({
                name: `${provider.displayName} ${provider.isDefault === true ? "(Default)" : ""}`,
                value: provider.providerId,
            })),
            default: providers.find((provider) => (provider.providerId === config.providerId))?.providerId,
        }
    ])

    const isNewProvider = providerId !== config.providerId;
    if (!isNewProvider) {
        logger.plain("the provider is same as before. No change in the configuration");
        return;
    }
    const selectedProvider = providers.find(provider => provider.providerId === providerId);
    const models = selectedProvider?.models;

    if (!models) {
        logger.error("There is no models available for the provider. Select a diffrent provider");
        await changeProvider(config);
        return;
    }

    const { modelId } = await inquirer.prompt<{ modelId: string }>([
        {
            type: "select",
            name: "modelId",
            message: `Select the default model for ${selectedProvider.displayName} in the config.`,
            choices: models.map((model) => ({
                name: `${model.displayName} ${model.isDefault === true ? "(Default)" : ""}`,
                value: model.modelId,
            })),
            default: models.find((model) => (model.isDefault === true))?.modelId,
        }
    ])

    const selectedModel = models.find(model => model.modelId === modelId);
    if (!selectedModel) {
        throw new CliUsageError("The selected model not found for the provider");
    }

    await harness.config.set({
        ...config,
        providerId: selectedProvider.providerId,
        modelId: selectedModel.modelId
    });

    logger.success(`The new configuration is set with provider: ${selectedProvider.displayName} and model: ${selectedModel.displayName}`);
}

async function changeModel(config: HarnessConfig) {
    const providers = await loadCatalogProviders();
    const selectedProvider = providers.find(provider => provider.providerId === config.providerId);
    const models = selectedProvider?.models;

    if (!models) {
        logger.error("There is no models available for the provider. Select a diffrent provider");
        await changeProvider(config);
        return;
    }

    const { modelId } = await inquirer.prompt<{ modelId: string }>([
        {
            type: "select",
            name: "modelId",
            message: `Select the default model for ${selectedProvider.displayName} in the config.`,
            choices: models.map((model) => ({
                name: `${model.displayName} ${model.isDefault === true ? "(Default)" : ""}`,
                value: model.modelId,
            })),
            default: models.find((model) => (model.isDefault === true))?.modelId,
        }
    ])

    const selectedModel = models.find(model => model.modelId === modelId);
    if (!selectedModel) {
        throw new CliUsageError("The selected model not found for the provider");
    }

    await harness.config.set({
        ...config,
        modelId: selectedModel.modelId
    });

    logger.success(`The new configuration is set with model: ${selectedModel.displayName}`);
}
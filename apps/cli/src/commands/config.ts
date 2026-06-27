import { Command } from "commander";
import inquirer from "inquirer";
import { HarnessConfigSchema, type HarnessConfig } from "@workspace/harness";
import { catalogStore, configStore, path } from "../utils/harness-config.js";
import { logger } from "../utils/logger.js";

export function configCommand(program: Command) {
    const command = program
        .command("config")
        .description("show or update validated configuration")
        .action(async () => {
            const config = await configStore.get();
            logger.plain(`Current configuration:`);
            logger.plain(JSON.stringify(config, null, 2));
        });

    command
        .command("show")
        .description("show the current configuration")
        .action(async () => {
            const config = await configStore.get();
            logger.plain(`Current configuration:`);
            logger.plain(JSON.stringify(config, null, 2));
        });

    command
        .command("get")
        .description("show the current configuration")
        .argument("[key]", "config key")
        .action(async (key?: string) => {
            await getConfigValue(key);
        });

    command
        .command("set")
        .description("interactively set a configuration key")
        .action(async () => {
            await setConfigValue();
        });

    command
        .command("path")
        .description("show the current configuration")
        .action(() => {
            logger.plain(`Current configuration path:`);
            logger.plain(path.getConfigFile());
        });

}

function flattenKeys(value: Record<string, unknown>, prefix = ""): string[] {
    const keys: string[] = [];

    for (const [key, val] of Object.entries(value)) {
        const keyPath = prefix ? `${prefix}.${key}` : key;

        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            keys.push(...flattenKeys(val as Record<string, unknown>, keyPath));
        } else {
            keys.push(keyPath);
        }
    }

    return keys;
}

function getByPath(source: Record<string, unknown>, keyPath: string): unknown {
    return keyPath.split(".").reduce<unknown>((acc, segment) => {
        if (acc === null || typeof acc !== "object") return undefined;
        return (acc as Record<string, unknown>)[segment];
    }, source);
}

function setByPath(source: Record<string, unknown>, keyPath: string, value: unknown): Record<string, unknown> {
    const segments = keyPath.split(".");
    const result: Record<string, unknown> = structuredClone(source);

    let cursor = result;
    for (const segment of segments.slice(0, -1)) {
        const next = cursor[segment];
        const nested = next !== null && typeof next === "object" && !Array.isArray(next) ? { ...(next as Record<string, unknown>) } : {};
        cursor[segment] = nested;
        cursor = nested;
    }

    cursor[segments[segments.length - 1] as string] = value;
    return result;
}

async function validateAndSave(candidate: unknown): Promise<void> {
    const result = HarnessConfigSchema.safeParse(candidate);
    if (!result.success) {
        logger.error("Invalid configuration, nothing was saved:");
        for (const issue of result.error.issues) {
            logger.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
        }
        return;
    }

    await configStore.set(result.data);
    logger.success("Configuration updated successfully.");
}

async function setProvider(config: HarnessConfig): Promise<void> {
    const providers = await catalogStore.getProvidersList();
    if (providers.length === 0) {
        logger.error("No providers found in the catalog. Run 'agent init' first.");
        return;
    }

    const { providerId } = await inquirer.prompt([
        {
            type: "select",
            name: "providerId",
            message: "Select a provider:",
            choices: providers.map((provider) => ({ name: provider.name, value: provider.id })),
            default: config.provider,
        },
    ]);

    // the previously selected model only still applies if the provider didn't change
    const selectedModelId = providerId === config.provider ? config.model : undefined;
    const modelId = await promptForModel(providerId, selectedModelId);
    if (modelId === undefined) return;

    await validateAndSave({ ...config, provider: providerId, model: modelId });
}

async function setModel(config: HarnessConfig): Promise<void> {
    const modelId = await promptForModel(config.provider, config.model);
    if (modelId === undefined) return;

    await validateAndSave({ ...config, model: modelId });
}

async function promptForModel(providerId: string, selectedModelId?: string): Promise<string | undefined> {
    const models = await catalogStore.getModelList(providerId);
    const modelList = Object.values(models);
    if (modelList.length === 0) {
        logger.error(`No models found for provider '${providerId}'.`);
        return undefined;
    }

    const defaultModelId = (await catalogStore.getDefaultModelPerProvider(providerId))?.id;

    const { modelId } = await inquirer.prompt([
        {
            type: "select",
            name: "modelId",
            message: `Select a model for provider '${providerId}':`,
            choices: modelList.map((model) => {
                const tags = [
                    model.id === defaultModelId ? "default" : null,
                    model.id === selectedModelId ? "selected" : null,
                ].filter((tag): tag is string => tag !== null);

                return {
                    name: tags.length > 0 ? `${model.name} (${tags.join(", ")})` : model.name,
                    value: model.id,
                };
            }),
            default: selectedModelId ?? defaultModelId,
        },
    ]);

    return modelId;
}

async function promptForValue(keyPath: string, currentValue: unknown): Promise<unknown> {
    if (Array.isArray(currentValue)) {
        const { newValue } = await inquirer.prompt([
            {
                type: "input",
                name: "newValue",
                message: `Enter value for '${keyPath}' as a comma-separated list (current: ${JSON.stringify(currentValue)}):`,
                default: currentValue.join(", "),
                filter: (input: string) => input.split(",").map((part) => part.trim()).filter(Boolean),
            },
        ]);
        return newValue;
    }

    if (typeof currentValue === "boolean") {
        const { newValue } = await inquirer.prompt([
            {
                type: "confirm",
                name: "newValue",
                message: `Enter value for '${keyPath}':`,
                default: currentValue,
            },
        ]);
        return newValue;
    }

    if (typeof currentValue === "number") {
        const { newValue } = await inquirer.prompt([
            {
                type: "number",
                name: "newValue",
                message: `Enter value for '${keyPath}' (current: ${currentValue}):`,
                default: currentValue,
            },
        ]);
        return newValue;
    }

    const { newValue } = await inquirer.prompt([
        {
            type: "input",
            name: "newValue",
            message: `Enter value for '${keyPath}' (current: ${JSON.stringify(currentValue)}):`,
            default: typeof currentValue === "string" ? currentValue : JSON.stringify(currentValue),
        },
    ]);
    return newValue;
}

async function setConfigValue(): Promise<void> {
    const config = await configStore.get();
    if (!config) {
        logger.error("No configuration found. Run 'agent init' first.");
        return;
    }

    const keys = flattenKeys(config);
    const { selectedKey } = await inquirer.prompt([
        {
            type: "select",
            name: "selectedKey",
            message: "Select a configuration key to set:",
            choices: keys,
        },
    ]);

    if (selectedKey === "provider") {
        await setProvider(config);
        return;
    }

    if (selectedKey === "model") {
        await setModel(config);
        return;
    }

    const currentValue = getByPath(config, selectedKey);
    const newValue = await promptForValue(selectedKey, currentValue);
    const updated = setByPath(config, selectedKey, newValue);

    await validateAndSave(updated);
}

async function getConfigValue(key?: string): Promise<void> {
    const config = await configStore.get();
    if (!config) {
        logger.error("No configuration found. Run 'agent init' first.");
        return;
    }

    if (!key) {
        const keys = flattenKeys(config);
        const { selectedKey } = await inquirer.prompt([
            {
                type: "select",
                name: "selectedKey",
                message: "Select a configuration key to view:",
                choices: keys,
            },
        ]);

        const currentValue = getByPath(config, selectedKey);

        return logger.plain(`Value for key '${selectedKey}': ${JSON.stringify(currentValue, null, 2)}`);
    }

    const currentValue = getByPath(config, key);

    logger.plain(`Value for key '${key}': ${JSON.stringify(currentValue, null, 2)}`);
}

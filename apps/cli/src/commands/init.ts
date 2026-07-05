import { Command } from "commander";
import { apiUrl, harness, logger } from "../utils/context.js";
import { CliUsageError } from "../utils/error.js";
import { CatalogModel, CatalogProvider } from "@workspace/harness";
import inquirer from "inquirer";
import path from "node:path";

export function initCommand(program: Command) {
    program
        .command("init")
        .description("Initialize provider, model, and workspace settings")
        .option("-f, --force", "initialize with backend defaults without prompting")
        .action(async (options: { force?: boolean }) => {
            await harness.paths.ensureAllDirExists();
            logger.step("Loading backend defaults and provider catalog…");
            const [bootstrap, providers] = await Promise.all([
                harness.api.getBootstrapConfig(),
                harness.api.listProviders(),
            ])
            if (providers.length === 0) {
                throw new CliUsageError("No enabled providers are available on the backend.")
            }

            const provider = options.force
                ? defaultProvider(providers, bootstrap.defaults.providerId)
                : await chooseProvider(providers, bootstrap.defaults.providerId)

            if (provider.models.length === 0) {
                throw new CliUsageError(`No enabled models are available for ${provider.displayName}.`)
            }

            const model = options.force
                ? defaultModel(provider, bootstrap.defaults.modelId)
                : await chooseModel(provider, bootstrap.defaults.modelId)

            const workspace = options.force ? { workspaceRoot: path.resolve(process.cwd()), trusted: true } : await chooseWorkspace()
            if (!workspace.trusted) {
                throw new CliUsageError("Initialization stopped because the workspace was not trusted.")
            }

            const previous = await harness.config.get()
            const now = new Date().toISOString()
            await harness.config.set({
                schemaVersion: 1,
                apiUrl: apiUrl,
                providerId: provider.providerId,
                modelId: model.modelId,
                workspaceRoots: [workspace.workspaceRoot],
                selectedCredentials: previous?.selectedCredentials ?? {},
                initializedAt: previous?.initializedAt ?? now,
                updatedAt: now,
            })
            await harness.catalog.set({ schemaVersion: 1, fetchedAt: now, providers })

            logger.success("CLI configuration was initialized.")
            logger.table(
                ["Setting", "Value"],
                [
                    ["Provider", provider.displayName],
                    ["Model", model.modelId],
                    ["Workspace", workspace.workspaceRoot],
                    ["Config", harness.paths.configFile],
                ]
            )

        })

}

function defaultProvider(providers: CatalogProvider[], defaultProviderId: string | null): CatalogProvider {
    return (
        providers.find((provider) => provider.providerId === defaultProviderId) ??
        providers.find((provider) => provider.isDefault) ?? providers[0]!
    )
}

function defaultModel(provider: CatalogProvider, defaultModelId: string | null): CatalogModel {
    return (
        provider.models.find((model) => model.modelId === defaultModelId) ??
        provider.models.find((model) => model.isDefault) ?? provider.models[0]!
    )
}

async function chooseModel(provider: CatalogProvider, defaultModelId: string | null): Promise<CatalogProvider["models"][number]> {
    const answer = await inquirer.prompt<{ modelId: string }>([
        {
            type: "select",
            name: "modelId",
            message: "Default model",
            choices: provider.models.map((entry) => ({
                name: `${entry.displayName}${entry.isDefault ? " (default)" : ""}`,
                value: entry.modelId,
            })),
            default: defaultModel(provider, defaultModelId).modelId,
        },
    ])
    const model = provider.models.find(
        (entry) => entry.modelId === answer.modelId
    )
    if (!model) throw new CliUsageError("The selected model is unavailable.")
    return model
}

async function chooseProvider(providers: CatalogProvider[], defaultProviderId: string | null): Promise<CatalogProvider> {
    const answer = await inquirer.prompt<{ providerId: string }>([
        {
            type: "select",
            name: "providerId",
            message: "Default provider",
            choices: providers.map((provider) => ({
                name: `${provider.displayName}${provider.isDefault ? " (default)" : ""}`,
                value: provider.providerId,
            })),
            default: defaultProvider(providers, defaultProviderId).providerId
        },
    ])
    const provider = providers.find((entry) => entry.providerId === answer.providerId);

    if (!provider) throw new CliUsageError("The selected provider is unavailable.")
    return provider
}

async function chooseWorkspace(): Promise<{ workspaceRoot: string, trusted: boolean }> {
    return inquirer.prompt<{ workspaceRoot: string; trusted: boolean }>([
        {
            type: "input",
            name: "workspaceRoot",
            message: "Workspace root",
            default: process.cwd(),
            filter: (value: string) => path.resolve(value.trim()),
            validate: (value: string) => value.trim().length > 0 || "Enter a path.",
        },
        {
            type: "confirm",
            name: "trusted",
            message: "Trust this directory for future local tool execution?",
            default: false,
        },
    ])
}
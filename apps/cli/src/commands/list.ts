import { Command } from "commander";
import { harness, logger } from "../utils/context.js";
import { formatNumber } from "../utils/format.js";
import { CliUsageError } from "../utils/error.js";
import { CatalogProvider } from "@workspace/harness";
import { createToolRegistry } from "@workspace/tool-registry";

interface ListOptions {
    providers?: boolean
    models?: boolean | string
    tools?: boolean
}

export function listCommand(program: Command) {
    program
        .command("list")
        .description("List providers, models, or registered tools")
        .option("-p, --providers", "list providers")
        .option("-m, --models [providerId]", "list models, optionally by provider")
        .option("-t, --tools", "list registered tools")
        .action(async (options: ListOptions) => {
            if (options.providers) {
                listProviders()
                return
            }

            if (options.models !== undefined) {
                const providerId = typeof options.models === "string" ? options.models : undefined
                listModels(providerId);
                return;
            }

            if (options.tools) {
                listTools()
                return;
            }
        })


}

async function listProviders() {
    const providers = await loadCatalogProviders();
    logger.heading("Providers");
    logger.table(
        ["Provider", "Name", "Models", "Default", "Documentation"],
        providers.map((provider) => [
            provider.providerId,
            provider.displayName,
            provider.models.length,
            provider.isDefault ? "yes" : "",
            provider.documentationUrl
        ])
    )
}

async function listModels(requestedProvider?: string): Promise<void> {
    const providers = await loadCatalogProviders();
    const models = providers
        .filter((provider) => !requestedProvider || provider.providerId === requestedProvider)
        .flatMap((provider) => provider.models);
    logger.heading(requestedProvider ? `Models for ${requestedProvider}` : "Models")
    logger.table(
        ["Provider", "Model", "Name", "Context", "Output", "Tools", "Default"],
        models.map((model) => [
            model.providerId,
            model.modelId,
            model.displayName,
            formatNumber(model.contextWindow),
            formatNumber(model.maxOutputTokens),
            model.supportsTools ? "yes" : "no",
            model.isDefault ? "yes" : "",
        ])
    )
}

async function loadCatalogProviders(): Promise<CatalogProvider[]> {
    const catalog = await harness.catalog.get();
    if (!catalog) {
        throw new CliUsageError("No provider catalog is cached. Run 'code-puppet init' first.");
    }
    return catalog.providers;
}

function listTools(): void {
    const tools = createToolRegistry().list()
    logger.heading("Registered tools")
    logger.table(
        ["Name", "Category", "Description", "Confirm"],
        tools.map((tool) => [
            tool.name,
            tool.category,
            tool.description,
            tool.requiresConfirmation ? "yes" : "no",
        ])
    )
}
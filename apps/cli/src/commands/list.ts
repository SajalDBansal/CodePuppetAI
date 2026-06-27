import axios from "axios";
import { Command } from "commander";
import { catalogStore } from "../utils/harness-config.js";
import inquirer from "inquirer";

export function listCommand(program: Command) {

    program
        .command("list")
        .description("List all the providers, models and tools the agent supports")
        .option("-p, --provider-list", "list all providers")
        .option("-m, --model-list", "list models for a provider")
        .option("-t, --tool-list", "list all the supported tools")
        .action(async (options: { providerList?: boolean, toolList?: boolean, modelList?: string }) => {
            const selected = [
                options.providerList,
                options.toolList,
                options.modelList,
            ].filter(Boolean);

            if (selected.length !== 1) {
                throw new Error(
                    "Specify exactly one of:\n" +
                    "  --provider-list\n" +
                    "  --model-list\n" +
                    "  --tool-list"
                );
            }

            if (options.providerList) {
                const providers = await catalogStore.getProvidersList();

                const tableData = providers.map((provider) => {
                    const defaultModel = Object.values(provider.models).find((model) => model.isDefault);
                    return {
                        Provider: provider.name,
                        Docs: provider.docs,
                        DefaultModel: defaultModel ? defaultModel.name : "N/A",
                        models: Object.keys(provider.models).length,
                    }
                });
                console.table(tableData);
            } else if (options.modelList) {
                const modelList = await getModelList();
                console.table(modelList);
            } else if (options.toolList) {
                // TODO: create the tool register and list the tools here
                console.log("Tool listing is not implemented yet.");
            }

        })

}

async function getModelList() {
    const providers = await catalogStore.getProvidersList();

    const { providerId } = await inquirer.prompt([
        {
            type: "select",
            name: "providerId",
            message: "Select a provider:",
            choices: providers.map((provider) => ({ name: provider.name, value: provider.id })),
        },
    ]);

    const models = providers.find((provider) => provider.id === providerId)?.models ?? {};
    return Object.values(models).map((model) => ({
        Model: model.name,
        Description: model.description ?? "N/A",
        ContextWindow: model.contextWindow,
        MaxOutputTokens: model.maxOutputTokens,
        ToolCall: model.toolCall ? "Yes" : "No",
        InputCostPer1M: model.inputCostPer1M ?? "N/A",
        OutputCostPer1M: model.outputCostPer1M ?? "N/A",
    }));
}

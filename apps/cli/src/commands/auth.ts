import { Command } from "commander";
import { harness, logger } from "../utils/context.js";
import { formatDate, shortId } from "../utils/format.js";
import inquirer from "inquirer";
import { CliUsageError } from "../utils/error.js";
import { CredentialMetadata } from "@workspace/harness";


export function authCommand(program: Command) {
    const auth = program
        .command("auth")
        .description("Manage provider API credentials stored by the backend")
        .action(async () => await showCredentials())

    auth
        .command("list")
        .description("List saved credential metadata")
        .action(async () => await showCredentials())

    auth
        .command("add")
        .description("Add or replace a provider API credential")
        .action(async () => {
            const catalog = (await harness.catalog.get())?.providers ?? (await harness.api.listProviders());
            const providerAnswer = await inquirer.prompt<{ providerId: string }>([
                catalog.length > 0
                    ? {
                        type: "select",
                        name: "providerId",
                        message: "Provider",
                        choices: catalog.map((provider) => ({
                            name: provider.displayName,
                            value: provider.providerId,
                        })),
                    }
                    : {
                        type: "input",
                        name: "providerId",
                        message: "Provider id",
                        validate: required("Enter a provider id."),
                    },
            ]);
            const answers = await inquirer.prompt<{ label: string; apiKey: string }>([
                {
                    type: "input",
                    name: "label",
                    message: "Credential label",
                    default: "default",
                    validate: required("Enter a credential label."),
                },
                {
                    type: "password",
                    name: "apiKey",
                    message: "API key",
                    mask: "*",
                    validate: required("Enter an API key."),
                },
            ])

            const credential = await harness.api.saveCredential({
                providerId: providerAnswer.providerId,
                label: answers.label.trim(),
                apiKey: answers.apiKey.trim(),
            })
            logger.success(`Saved '${credential.label}' for ${credential.providerId}. The key remains on the backend.`);
        })

    auth
        .command("use")
        .description("Select the credential used for a provider")
        .action(async () => {
            const config = await harness.config.get()
            if (!config) {
                throw new CliUsageError("Run 'code-puppet init' before selecting a credential.")
            }
            const credentials = await harness.api.listCredentials()
            if (credentials.length === 0) {
                throw new CliUsageError("No credentials are saved. Run 'code-puppet auth add'.")
            }
            const answer = await inquirer.prompt<{ credentialId: string }>([
                {
                    type: "select",
                    name: "credentialId",
                    message: "Credential",
                    choices: credentials.map((credential) => ({
                        name: `${credential.providerId} / ${credential.label}`,
                        value: credential.id,
                    })),
                },
            ])
            const credential = requireCredential(credentials, answer.credentialId)
            await harness.config.selectCredential(credential)
            logger.success(`Selected '${credential.label}' for ${credential.providerId}.`)
        })

    auth
        .command("remove")
        .description("Remove one or all saved credentials")
        .option("--all", "remove every credential")
        .action(async (options: { all?: boolean }) => {
            const credentials = await harness.api.listCredentials()
            if (credentials.length === 0) {
                logger.info("No credentials are saved.")
                return
            }
            if (options.all) {
                const answer = await inquirer.prompt<{ confirmed: boolean }>([
                    {
                        type: "confirm",
                        name: "confirmed",
                        message: `Remove all ${credentials.length} credentials?`,
                        default: false,
                    },
                ])
                if (!answer.confirmed) return
                const count = await harness.api.removeAllCredentials()
                const config = await harness.config.get()
                if (config) {
                    await harness.config.set({
                        ...config,
                        selectedCredentials: {},
                        updatedAt: new Date().toISOString(),
                    })
                }
                logger.success(`Removed ${count} credentials.`)
                return
            }


            const answer = await inquirer.prompt<{ credentialId: string, confirmed: boolean }>([
                {
                    type: "select",
                    name: "credentialId",
                    message: "Credential",
                    choices: credentials.map((credential) => ({
                        name: `${credential.providerId} / ${credential.label}`,
                        value: credential.id,
                    })),
                },
                {
                    type: "confirm",
                    name: "confirmed",
                    message: "Remove this credential?",
                    default: false,
                },
            ])
            if (!answer.confirmed) return
            const credential = requireCredential(credentials, answer.credentialId)
            await harness.api.removeCredential(credential.id)
            const config = await harness.config.get()

            if (config?.selectedCredentials[credential.providerId]?.id === credential.id) {
                await harness.config.clearCredential(credential.providerId)
            }
            logger.success(`Removed '${credential.label}'.`);
        })
}

async function showCredentials(): Promise<void> {
    const [credentials, config] = await Promise.all([
        harness.api.listCredentials(),
        harness.config.get()
    ]);
    if (credentials.length === 0) {
        logger.info("No credentials are saved. Run 'code-puppet auth add'.");
        return;
    }

    logger.heading("Provider credentials");
    logger.table(
        ["Id", "Provider", "Label", "Selected", "Last Used", "Updated"],
        credentials.map((cred) => [
            shortId(cred.id),
            cred.providerId,
            cred.label,
            logger.selected(config?.selectedCredentials[cred.providerId]?.id === cred.id),
            formatDate(cred.lastUsedAt),
            formatDate(cred.updatedAt),
        ])
    )
}

function required(message: string) {
    return (value: string) => value.trim().length > 0 || message
}

function requireCredential(credentials: CredentialMetadata[], credentialId: string): CredentialMetadata {
    const credential = credentials.find((entry) => entry.id === credentialId)
    if (!credential)
        throw new CliUsageError("The selected credential is unavailable.")
    return credential
}
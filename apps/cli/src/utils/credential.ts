import { harness } from "./context.js";
import { CliUsageError } from "./error.js";
import { CredentialMetadata } from "@workspace/harness";

// Shared by `ask` and `session continue` - both need a credential to send with
// the session request before they can do anything else. An explicit --credential
// label is looked up directly; otherwise falls back to whatever `auth use`
// selected for the provider in the local config.
export async function resolveCredential(providerId: string, label?: string): Promise<CredentialMetadata> {
    if (label) {
        const credentials = await harness.api.listCredentials();
        const credential = credentials.find((entry) => entry.providerId === providerId && entry.label === label);
        if (!credential) {
            throw new CliUsageError(`No credential named '${label}' for provider '${providerId}'. Run 'code-puppet auth add'.`);
        }
        return credential;
    }

    const config = await harness.config.get();
    const selected = config?.selectedCredentials[providerId];
    if (!selected) {
        throw new CliUsageError(`No credential selected for '${providerId}'. Run 'code-puppet auth use' or pass --credential.`);
    }
    return selected;
}

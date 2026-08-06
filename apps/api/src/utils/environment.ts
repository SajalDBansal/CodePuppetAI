import { createProviderRegistery, ProviderRegistry } from "@workspace/provider-registry";
import { createToolRegistry, ToolRegistry } from "@workspace/tool-registry";
import z from "zod";

const EnvironmentSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    DATABASE_URL: z.string().min(1),
    APP_NAME: z.string().trim().min(1).default("Code Puppet"),

    ADMIN_USER_IDS: z.string().trim().optional(),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    WEB_ORIGIN: z.url(),

    CLI_CLIENT_ID: z.string().trim().min(1).default("code-puppet"),
    DEVICE_VERIFICATION_URI: z.url(),
    VAULT_MASTER_KEY: z.string().min(1),
    COOKIE_DOMAIN: z.string().trim().optional(),

    // Add sandbox credentials later
});

const parsedEnvironment = EnvironmentSchema.safeParse(process.env)
if (!parsedEnvironment.success) {
    const details = parsedEnvironment.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
    throw new Error(`Invalid API environment: ${details}`);
}

const masterKey = Buffer.from(parsedEnvironment.data.VAULT_MASTER_KEY, "base64");
if (masterKey.length < 32) {
    throw new Error("VAULT_MASTER_KEY must decode to atleast 32 bytes");
}

export const environment = parsedEnvironment.data;

export const providerRegistry: ProviderRegistry = createProviderRegistery();
export const toolRegistry: ToolRegistry = createToolRegistry();
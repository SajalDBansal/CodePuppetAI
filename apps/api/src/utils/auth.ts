import { betterAuth, type BetterAuthOptions } from "better-auth";
import { envConfig } from "./config.js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@workspace/database";
import { admin, bearer, deviceAuthorization } from "better-auth/plugins";
import { Request } from "express";
import { AuthenticationError } from "./error.js";

export const CLI_CLIENT_ID = "deepmind-cli"

const authOptions = {
    appName: envConfig.APP_NAME,
    baseURL: envConfig.BETTER_AUTH_URL,
    basePath: "/api/v1/auth",
    secret: envConfig.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    trustedOrigins: [envConfig.WEB_ORIGIN],
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        requireEmailVerification: false
    },
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // 1 day
    },
    plugins: [
        bearer(),
        admin(),
        deviceAuthorization({
            expiresIn: "10m",
            interval: "5s",
            verificationUri: `${envConfig.WEB_ORIGIN}/device`,
            validateClient: (clientId) => clientId === CLI_CLIENT_ID,
        })
    ]
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
export type NewCodingAuth = typeof auth;

export function requireUserId(request: Request): string {
    const userId = request.authUser?.id;
    if (!userId) {
        throw new AuthenticationError("User session is unauthorized");
    }
    return userId;
}

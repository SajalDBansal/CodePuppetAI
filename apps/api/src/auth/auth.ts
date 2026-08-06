import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@workspace/database";
import { admin, bearer, deviceAuthorization } from "better-auth/plugins";
import { environment } from "../utils/environment.js";

const authOptions = {
    appName: environment.APP_NAME,
    baseURL: environment.BETTER_AUTH_URL,
    basePath: "/api/v1/auth",
    secret: environment.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    trustedOrigins: [environment.WEB_ORIGIN],
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        requireEmailVerification: false
    },
    session: {
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // 1 day
    },
    ...(environment.COOKIE_DOMAIN ? {
        advanced: {
            crossSubDomainCookies: {
                enabled: true,
                domain: environment.COOKIE_DOMAIN,
            },
        },
    } : {}),
    plugins: [
        bearer(),
        admin({
            defaultRole: "user",
            adminRoles: ["admin"],
            adminUserIds: environment.ADMIN_USER_IDS?.split(",").map((userId) => userId.trim()).filter(Boolean)
        }),
        deviceAuthorization({
            expiresIn: "10m",
            interval: "5s",
            verificationUri: environment.DEVICE_VERIFICATION_URI,
            validateClient: (clientId) => clientId === environment.CLI_CLIENT_ID,
        })
    ]
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
export type ApplicationAuth = typeof auth;
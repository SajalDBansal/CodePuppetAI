import type { Request, Response } from "express";
import { validate } from "../utils/validate.js";
import { DeviceLoginDecisionSchema, DeviceLoginStartSchema, DeviceLoginTokenSchema, DeviceLoginVerificationSchema } from "@workspace/protocol";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth.js";
import { prisma } from "@workspace/database";
import { NotFoundError } from "../utils/api-error.js";
import { environment } from "../utils/environment.js";

export class DeviceLoginController {
    start = async (request: Request, response: Response): Promise<Response> => {
        const input = validate(DeviceLoginStartSchema, request.body ?? {})
        const device = await auth.api.deviceCode({
            body: { client_id: environment.CLI_CLIENT_ID },
        })

        await prisma.deviceCode.update({
            where: { deviceCode: device.device_code },
            data: { deviceName: input.deviceName },
        })

        response.setHeader("Cache-Control", "no-store")
        response.setHeader("Pragma", "no-cache")
        return response.status(200).json({
            deviceCode: device.device_code,
            userCode: device.user_code,
            verificationUri: device.verification_uri,
            verificationUriComplete: device.verification_uri_complete,
            expiresIn: device.expires_in,
            interval: device.interval,
        })
    }

    exchangeToken = async (request: Request, response: Response): Promise<Response> => {
        const input = validate(DeviceLoginTokenSchema, request.body)
        const token = await auth.api.deviceToken({
            body: {
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: input.deviceCode,
                client_id: environment.CLI_CLIENT_ID,
            },
        })

        response.setHeader("Cache-Control", "no-store")
        response.setHeader("Pragma", "no-cache")
        return response.status(200).json({
            status: "approved",
            accessToken: token.access_token,
            tokenType: token.token_type,
            expiresIn: token.expires_in,
            scope: token.scope,
        })
    }

    verify = async (request: Request, response: Response): Promise<Response> => {
        const input = validate(DeviceLoginVerificationSchema, request.query);
        const headers = fromNodeHeaders(request.headers);

        const result = await auth.api.deviceVerify({ query: { user_code: input.userCode }, headers });
        const normalizedCode = input.userCode.replaceAll("-", "")
        const device = await prisma.deviceCode.findUnique({
            where: { userCode: normalizedCode },
            select: { deviceName: true, expiresAt: true },
        })
        if (!device) {
            throw new NotFoundError("The device login request was not found.")
        }
        return response.status(200).json({
            status: result.status,
            deviceName: device.deviceName,
            expiresAt: device.expiresAt.toISOString(),
        })
    }

    decide = async (request: Request, response: Response): Promise<Response> => {
        const input = validate(DeviceLoginDecisionSchema, request.body);
        const headers = fromNodeHeaders(request.headers);

        if (input.decision === "approve") {
            await auth.api.deviceApprove({ body: { userCode: input.userCode }, headers })
        } else {
            await auth.api.deviceDeny({ body: { userCode: input.userCode }, headers })
        }
        return response.status(200).json({ status: input.decision })
    }

}
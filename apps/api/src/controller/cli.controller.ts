import { CLI_CLIENT_ID, NewCodingAuth, requireUserId } from "../utils/auth.js";
import { Request, Response } from "express";
import { DeviceDecisionSchema, DeviceLoginStartSchema, DeviceLoginTokenSchema, VerifyUserCodeSchema } from "@workspace/protocol";
import { AuthenticationError, DeviceAuthError, ValidationError } from "../utils/error.js";
import { prisma } from "@workspace/database";
import { fromNodeHeaders } from "better-auth/node";

export class CliController {

    constructor(public auth: NewCodingAuth) { }

    /** Starts a standard OAuth device authorization request for the CLI. */
    startLogin = async (request: Request, response: Response) => {

        const validate = DeviceLoginStartSchema.safeParse(request.body ?? {});
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }

        const device = await this.auth.api.deviceCode({
            body: { client_id: CLI_CLIENT_ID },
        })
        await prisma.deviceCode.update({
            where: { deviceCode: device.device_code },
            data: { deviceName: validate.data.deviceName },
        });

        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");

        const result = {
            deviceCode: device.device_code,
            userCode: device.user_code,
            verificationUri: device.verification_uri,
            verificationUriComplete: device.verification_uri_complete,
            expiresIn: device.expires_in,
            interval: device.interval,
        };

        return response.status(200).json(result);
    }

    /** the device continously pools to this until request is approved, denied or expires in the database.  */
    exchangeToken = async (request: Request, response: Response) => {
        const body = request.body;
        const validate = DeviceLoginTokenSchema.safeParse(body);
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }
        const { deviceCode } = validate.data;
        const token = await this.auth.api.deviceToken({
            body: {
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: deviceCode,
                client_id: CLI_CLIENT_ID
            }
        });

        const session = await prisma.session.findUnique({
            where: { token: token.access_token },
            select: {
                expiresAt: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            }
        });

        if (!session) {
            throw new AuthenticationError("Device session was not found.");
        }

        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
        const result = {
            status: "approved",
            accessToken: token.access_token,
            tokenType: token.token_type,
            expiresIn: token.expires_in,
            expiresAt: session.expiresAt.toISOString(),
            scope: token.scope,
            user: session.user,
        }
        return response.status(200).json(result);
    }

    /** browser looks for the pending device for authrization matches the code if device details present */
    verifyLogin = async (request: Request, response: Response) => {
        const query = request.query;
        const validate = VerifyUserCodeSchema.safeParse(query);
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }
        const { userCode } = validate.data;

        const verified = await this.auth.api.deviceVerify({
            query: { user_code: userCode },
            headers: fromNodeHeaders(request.headers)
        });

        const cleanUserCode = userCode.replace(/-/g, "");
        const deviceCodeData = await prisma.deviceCode.findUnique({
            where: { userCode: cleanUserCode },
            select: { expiresAt: true, deviceName: true },
        });

        if (!deviceCodeData || deviceCodeData.expiresAt < new Date()) {
            throw new DeviceAuthError("Device code expired.");
        }

        return response.status(200).json({
            status: verified.status,
            expiresAt: deviceCodeData.expiresAt.toISOString(),
            deviceName: deviceCodeData.deviceName,
        })
    }

    /** the loggedin broswer session approves or rejects the device approval request */
    decideLogin = async (request: Request, response: Response) => {
        const body = request.body;
        const validate = DeviceDecisionSchema.safeParse(body);
        if (!validate.success) {
            throw new ValidationError(validate.error.issues.map(issue => issue.message).join(", "));
        }
        const { userCode, decision } = validate.data;
        const headers = fromNodeHeaders(request.headers);

        if (decision === "approve") {
            await this.auth.api.deviceApprove({ body: { userCode }, headers });
        } else {
            await this.auth.api.deviceDeny({ body: { userCode }, headers });
        }
        return response.status(200).json({ status: decision })
    }

    /** the device session in revoked when the user send logout request */
    logout = async (request: Request, response: Response) => {
        const sessionId = request.session?.id || "";
        const userId = requireUserId(request);
        await prisma.session.deleteMany({
            where: { id: sessionId, userId },
        });
        return response.status(200).send();
    }
}

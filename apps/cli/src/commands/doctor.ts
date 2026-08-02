import { Command } from "commander";
import { apiUrl, harness, logger } from "../utils/context.js";
import { access, constants } from "node:fs/promises"
import { createToolRegistry } from "@workspace/tool-registry";


interface DoctorCheck {
    check: string
    status: "ok" | "warning" | "failed"
    detail: string
}

export function doctorCommand(program: Command) {
    program
        .command("doctor")
        .description("Check the CLI, backend, login, configuration, and workspace")
        .action(async () => {
            logger.step("Running diagnostics…")
            const [paths, live, ready, auth, config, catalog] = await Promise.all([
                harness.paths.status(),
                harness.api.checkLive(),
                harness.api.checkReady(),
                harness.auth.get(),
                harness.config.get(),
                harness.catalog.get(),
            ])

            const checks: DoctorCheck[] = [
                {
                    check: "Backend process",
                    status: live ? "ok" : "failed",
                    detail: live ? apiUrl : `Cannot reach ${apiUrl}`,
                },
                {
                    check: "Backend database",
                    status: ready ? "ok" : "failed",
                    detail: ready ? "Available" : "Unavailable",
                },
                {
                    check: "Data directory",
                    status: paths.agentDirectory ? "ok" : "warning",
                    detail: harness.paths.agentDir,
                },
                {
                    check: "Login",
                    status:
                        auth && (await harness.auth.isAuthenticated()) ? "ok" : "warning",
                    detail: auth ? auth.user.email : "Run code-puppet login",
                },
                {
                    check: "Configuration",
                    status: config ? "ok" : "warning",
                    detail: config ? `${config.providerId} / ${config.modelId}` : "Run code-puppet init",
                },
                {
                    check: "Catalog cache",
                    status: catalog ? "ok" : "warning",
                    detail: catalog ? `${catalog.providers.length} providers, fetched ${catalog.fetchedAt}` : "Created during init",
                },
                {
                    check: "Tool registry",
                    status: "ok",
                    detail: `${createToolRegistry().list().length} tools registered`,
                },
            ]
            if (config) {
                checks.push(...(await workspaceChecks(config.workspaceRoots)))
            }

            logger.heading("Doctor report")
            logger.table(
                ["Check", "Status", "Detail"],
                checks.map((check) => [
                    check.check,
                    logger.status(check.status),
                    check.detail,
                ])
            )

            const failed = checks.filter((check) => check.status === "failed").length
            const warnings = checks.filter((check) => check.status === "warning").length
            if (failed > 0) {
                logger.error(`${failed} checks failed; ${warnings} warnings remain.`)
                process.exitCode = 1
            } else if (warnings > 0) {
                logger.warn(`Diagnostics passed with ${warnings} warnings.`)
            } else {
                logger.success("All diagnostics passed.")
            }

        })

}

async function workspaceChecks(roots: string[]): Promise<DoctorCheck[]> {
    return Promise.all(
        roots.map(async (root) => {
            try {
                await access(root, constants.R_OK | constants.W_OK)
                return { check: "Workspace", status: "ok", detail: root } as DoctorCheck
            } catch {
                return {
                    check: "Workspace",
                    status: "failed",
                    detail: `${root} is not readable and writable`,
                } as DoctorCheck
            }
        })
    )
}
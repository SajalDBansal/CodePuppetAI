import { errorMessage } from "./utils/error.js";
import { Command, CommanderError } from "commander";
import { ENV_CONFIG, logger } from "./utils/context.js";
import { installPrehooks } from "./hook.js";
import { accountCommand, authCommand, configCommand, doctorCommand, initCommand, listCommand } from "./commands/index.js"

export async function runCli(args: string[], cwd = process.cwd()): Promise<void> {
    const program = buildProgram();
    try {
        await program.parseAsync(args, { from: "user" });
    } catch (error) {
        if (error instanceof CommanderError) {
            if (["commander.helpDisplayed", "commander.version"].includes(error.code)) {
                process.exitCode = 0;
                return;
            }

            process.exitCode = error.exitCode;
            logger.error(errorMessage(error));
            return;
        }

        logger.error(errorMessage(error));
        process.exitCode = 1;
    }
}

function buildProgram(cwd = process.cwd()): Command {
    const program = new Command()
        .name("code-puppet")
        .description("A CLI based AI code Harness to simplify AI development.")
        .version(ENV_CONFIG.VERSION)
        .showHelpAfterError()
        .configureHelp({ sortSubcommands: true, sortOptions: true })
        .exitOverride()
        .option("--quiet", "reduce CLI output");

    program.hook("preAction", (root) => {
        logger.setQuiet(Boolean(root.opts<{ quiet?: boolean }>().quiet))
    })

    // preaction for device auth & workspaceRoot
    installPrehooks(program);

    // account
    accountCommand(program);

    // auth
    authCommand(program);

    // init
    initCommand(program);

    // list
    listCommand(program);

    // doctor
    doctorCommand(program);

    // config
    configCommand(program);

    program.action(() => program.outputHelp())
    program.addHelpText(
        "after",
        "\nEnvironment:\n  CODE_PUPPET_API_URL  Backend URL (default: http://localhost:3001)\n  AGENT_DEBUG          Set to 1 for debug messages\n"
    )

    return program;
}
import { errorMessage } from "./utils/error.js";
import { Command, CommanderError } from "commander";
import { ENV_CONFIG, logger } from "./utils/context.js";
import { installPrehooks } from "./hook.js";
import { accountCommand, authCommand, doctorCommand, initCommand, listCommand } from "./commands/index.js"

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

    program.action(() => program.outputHelp())
    program.addHelpText(
        "after",
        "\nEnvironment:\n  CODE_PUPPET_API_URL  Backend URL (default: http://localhost:3001)\n  AGENT_DEBUG          Set to 1 for debug messages\n"
    )

    return program;
}


// program.hook("preAction", async (_command, actionCommand) => {
//     if (actionCommand === program) return;
//     const commandName = actionCommand.name();
//     const status = await preHookCheck();
//     if (!status.authenticated && !AUTH_EXEMPT_COMMANDS.has(commandName)) {
//         throw new AuthenticationError();
//     }
//     if (!status.configInitialized && !CONFIG_EXEMPT_COMMANDS.has(commandName)) {
//         throw new InitializationError();
//     }
// })

// program.hook("preAction", async (_command, actionCommand) => {
//     if (actionCommand === program) return;
//     const commandName = actionCommand.name();
//     if (CONFIG_EXEMPT_COMMANDS.has(commandName)) return;
//     await checkWorkspaceTrust(process.cwd());
// })

// program.action(async () => {
//     const status = await preHookCheck();
//     logger.success(`Welcome to Deepmind Harness`);
//     if (!status.authenticated) {
//         logger.error(`Run the 'deepmind login' command to login to cli`)
//     } else if (!status.configInitialized) {
//         logger.error(`Run the 'deepmind init' command to store the default configuration of the harness`);
//     }
//     logger.plain(program.helpInformation());
// });

// // -- account
// accountCommand(program);

// // -- init
// initCommand(program);

// // -- config
// configCommand(program);

// // -- auth
// authCommand(program);

// // -- list
// listCommand(program);

// // -- doctor
// doctorCommand(program);

// -- memory
// -- search
// -- usage

// -- run
// -- ask
// -- chat
// -- review
// -- resume
// -- session
// -- show
// -- fork
// -- replay

// -- rpc -- ? to check what is this

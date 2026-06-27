import { AuthenticationError, errorMessage, HarnessError, InitializationError } from "./utils/error.js";
import { Command, CommanderError } from "commander";
import { version } from "./version.js";
import { accountCommand, preHookCheck, initCommand, configCommand, authCommand, listCommand, doctorCommand, checkWorkspaceTrust } from "./commands/index.js";
import { logger } from "./utils/logger.js";

const NOT_IMPLEMENTED_EXIT_CODE = 3
const AUTH_REQUIRED_EXIT_CODE = 4
const INIT_REQUIRED_EXIT_CODE = 5

const AUTH_EXEMPT_COMMANDS = new Set(["login", "logout", "status", "doctor"])
const CONFIG_EXEMPT_COMMANDS = new Set(["login", "logout", "status", "doctor", "init",])

export async function runCli(args: string[], cwd = process.cwd()): Promise<void> {
    const program = buildProgram();
    try {
        await program.parseAsync(args, { from: "user" });
    } catch (error) {
        const authRequired = error instanceof AuthenticationError;
        const initRequired = error instanceof InitializationError;

        if (error instanceof CommanderError && error.exitCode === 0) return;

        const code = error instanceof HarnessError ? error.exitCode : authRequired
            ? AUTH_REQUIRED_EXIT_CODE
            : initRequired
                ? INIT_REQUIRED_EXIT_CODE
                : 1;

        logger.error(`Error: ${errorMessage(error)}`);
        process.exitCode = code;
    }
}

function buildProgram(cwd = process.cwd()): Command {
    const program = new Command()
        .name("deepmind")
        .description("A CLI based AI code Harness to simplify AI development.")
        .version(version)
        .showHelpAfterError()
        .configureHelp({ sortSubcommands: true, sortOptions: true })
        .exitOverride()
        .option("--quiet", "reduce CLI output");

    program.hook("preAction", async (_command, actionCommand) => {
        if (actionCommand === program) return;
        const commandName = actionCommand.name();
        const status = await preHookCheck();
        if (!status.authenticated && !AUTH_EXEMPT_COMMANDS.has(commandName)) {
            throw new AuthenticationError();
        }
        if (!status.configInitialized && !CONFIG_EXEMPT_COMMANDS.has(commandName)) {
            throw new InitializationError();
        }
    })

    program.hook("preAction", async (_command, actionCommand) => {
        if (actionCommand === program) return;
        const commandName = actionCommand.name();
        if (CONFIG_EXEMPT_COMMANDS.has(commandName)) return;
        await checkWorkspaceTrust(process.cwd());
    })

    program.action(async () => {
        const status = await preHookCheck();
        logger.success(`Welcome to Deepmind Harness`);
        if (!status.authenticated) {
            logger.error(`Run the 'deepmind login' command to login to cli`)
        } else if (!status.configInitialized) {
            logger.error(`Run the 'deepmind init' command to store the default configuration of the harness`);
        }
        logger.plain(program.helpInformation());
    });

    // -- account
    accountCommand(program);

    // -- init
    initCommand(program);

    // -- config
    configCommand(program);

    // -- auth
    authCommand(program);

    // -- list
    listCommand(program);

    // -- doctor
    doctorCommand(program);

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

    return program;
}

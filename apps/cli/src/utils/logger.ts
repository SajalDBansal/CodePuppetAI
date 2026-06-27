import chalk from "chalk";

export type Logger = {
    plain(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    success(message: string): void;
    debug(message: string): void;
};

export const logger: Logger = {
    plain(message) {
        console.log(chalk.white(message));
    },
    info(message) {
        console.log(chalk.cyan(message));
    },
    warn(message) {
        console.warn(chalk.yellow(message));
    },
    error(message) {
        console.error(chalk.red(message));
    },
    success(message) {
        console.log(chalk.green(message));
    },
    debug(message) {
        if (process.env.DEBUG) {
            console.log(chalk.gray(message));
        }
    }
};

export function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

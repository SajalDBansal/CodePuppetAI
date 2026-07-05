import chalk, { Chalk, type ChalkInstance } from "chalk"
import { renderTable, type TableValue } from "./table.js"

export interface LoggerOptions {
    quiet?: boolean
    debug?: boolean
    stdout?: Pick<NodeJS.WriteStream, "write">
    stderr?: Pick<NodeJS.WriteStream, "write">
    colors?: boolean
}

export class Logger {
    private quiet: boolean
    private readonly debugEnabled: boolean
    private readonly stdout: Pick<NodeJS.WriteStream, "write">
    private readonly stderr: Pick<NodeJS.WriteStream, "write">
    private readonly color: ChalkInstance

    constructor(options: LoggerOptions = {}) {
        this.quiet = options.quiet ?? false
        this.debugEnabled = options.debug ?? false
        this.stdout = options.stdout ?? process.stdout
        this.stderr = options.stderr ?? process.stderr
        this.color = options.colors === false ? new Chalk({ level: 0 }) : chalk
    }

    setQuiet(quiet: boolean): void {
        this.quiet = quiet
    }

    plain(message = ""): void {
        if (!this.quiet) this.write(this.stdout, message)
    }

    heading(message: string): void {
        this.plain(this.color.bold.cyan(message))
    }

    info(message: string): void {
        this.plain(`${this.color.cyan("ℹ")} ${message}`)
    }

    step(message: string): void {
        this.plain(`${this.color.blue("›")} ${message}`)
    }

    success(message: string): void {
        this.plain(`${this.color.green("✓")} ${message}`)
    }

    warn(message: string): void {
        if (!this.quiet)
            this.write(this.stderr, `${this.color.yellow("!")} ${message}`)
    }

    error(message: string): void {
        this.write(this.stderr, `${this.color.red("✖")} ${message}`)
    }

    debug(message: string): void {
        if (this.debugEnabled && !this.quiet) {
            this.write(this.stderr, `${this.color.gray("debug")} ${message}`)
        }
    }

    keyValue(label: string, value: TableValue): void {
        this.plain(`${this.color.dim(`${label}:`)} ${value ?? "—"}`)
    }

    table(headers: string[], rows: TableValue[][]): void {
        this.plain(renderTable(headers, rows))
    }

    status(value: string): string {
        if (["ready", "completed", "ok", "available", "valid"].includes(value)) {
            return this.color.green(value)
        }
        if (["failed", "cancelled", "unavailable", "invalid"].includes(value)) {
            return this.color.red(value)
        }
        return this.color.yellow(value)
    }

    selected(value: boolean): string {
        return value ? this.color.green("selected") : ""
    }

    private write(
        stream: Pick<NodeJS.WriteStream, "write">,
        message: string
    ): void {
        stream.write(`${message}\n`)
    }
}

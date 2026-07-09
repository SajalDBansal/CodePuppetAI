export class ToolNotRegisteredError extends Error {
    constructor(toolName: string) {
        super(`No tool is registered with the name "${toolName}".`)
        this.name = "ToolNotRegisteredError"
    }
}

export class ToolAlreadyRegisteredError extends Error {
    constructor(toolName: string) {
        super(`A tool is already registered with the name "${toolName}".`)
        this.name = "ToolAlreadyRegisteredError"
    }
}
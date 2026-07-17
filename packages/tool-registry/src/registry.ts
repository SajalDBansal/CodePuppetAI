import { ToolAlreadyRegisteredError, ToolNotRegisteredError } from "./error.js";
import { ProviderToolDefinition, ToolCategory, ToolDefinition } from "@workspace/protocol";

export class ToolRegistry {
    private readonly tools = new Map<string, ToolDefinition>;

    constructor(tools: ToolDefinition[]) {
        for (const tool of tools) {
            this.register(tool);
        }
    }

    register(tool: ToolDefinition): void {
        if (this.tools.has(tool.name)) {
            throw new ToolAlreadyRegisteredError(tool.name);
        }
        this.tools.set(tool.name, tool);
    }

    has(toolName: string): boolean {
        return this.tools.has(toolName);
    }

    get(toolName: string): ToolDefinition {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new ToolNotRegisteredError(toolName);
        }
        return tool
    }

    list(category?: ToolCategory): ToolDefinition[] {
        const tools = [...this.tools.values()];
        return category ? tools.filter(tool => tool.category === category) : tools
    }

    getProviderTools(): ProviderToolDefinition[] {
        return this.list().map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }))
    }
    getBackendTools() { }
    getClientTools() { }
    resolve() { }

}
import type {
    ToolSideEffect, ToolExecutionTarget,
    Actor, ToolDeclaration, ToolExecutionEvent, ToolResult, ToolResultStatus,
    JsonSchema,
} from "@workspace/protocol";
import z from "zod";

export interface ToolDefinition
    <TInput extends z.ZodTypeAny = z.ZodTypeAny,
        TOutput extends z.ZodTypeAny = z.ZodTypeAny> {
    name: string;
    description: string;
    inputSchema: TInput;
    outputSchema: TOutput;
    jsonSchema: JsonSchema;
    executionTarget: ToolExecutionTarget;
    sideEffect: ToolSideEffect;
    requiresConfirmation: boolean;
    timeoutMs?: number;
    execute(input: z.output<TInput>, context: ToolExecutionContext): Promise<ToolExecutionResult<z.output<TOutput>>>
}

export interface ToolExecutionContext {
    actor: Actor;
    sessionId: string;
    turnId: string;
    toolCallId: string;
    workspaceRoot: string;
    cwd: string;
    trustLevel: "trusted" | "untrusted";
    signal: AbortSignal;
    emit(event: ToolExecutionEvent): void;
    confirm(message: string): Promise<boolean>;
}

export interface ToolExecutionResult<TOutput = unknown> {
    status: ToolResultStatus;
    output: TOutput;
    content: string;
    isError: boolean;
    durationMs: number;
    truncated?: boolean;
    resultRef?: string;
    metadata?: Record<string, unknown>;
}


export function toToolDeclaration(tool: ToolDefinition): ToolDeclaration {
    return {
        name: tool.name,
        description: tool.description,
        jsonSchema: tool.jsonSchema,
        sideEffect: tool.sideEffect,
        executionTarget: tool.executionTarget,
        requiresConfirmation: tool.requiresConfirmation,
        timeoutMs: tool.timeoutMs,
        version: "1",
    }
}

export function toToolResult(toolCallId: string, name: string, result: ToolExecutionResult): ToolResult {
    return {
        toolCallId, name,
        status: result.status,
        output: result.output,
        content: result.content,
        isError: result.isError,
        durationMs: result.durationMs,
        truncated: result.truncated ?? false,
        resultRef: result.resultRef,
        metadata: result.metadata,
    }

}

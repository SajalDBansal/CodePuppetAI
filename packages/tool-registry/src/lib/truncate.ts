const DEFAULT_MAX_CHARS = 50_000;

export function truncateOutput(text: string, maxChars: number = DEFAULT_MAX_CHARS): string {
    if (text.length <= maxChars) {
        return text;
    }

    const omittedChars = text.length - maxChars;
    return `${text.slice(0, maxChars)}\n... (truncated, ${omittedChars} more characters)`;
}

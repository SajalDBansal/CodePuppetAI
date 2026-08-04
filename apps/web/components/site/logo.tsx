export function SpikeMark({ className = "h-4 w-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
            <path d="M11.1 1h1.8v8.2l4.5-4.5 1.27 1.27-4.5 4.5H22.4v1.8h-8.23l4.5 4.5-1.27 1.27-4.5-4.5V22.4h-1.8v-8.23l-4.5 4.5-1.27-1.27 4.5-4.5H1.6v-1.8h8.23l-4.5-4.5L6.6 4.7l4.5 4.5V1z" />
        </svg>
    );
}

export function Wordmark() {
    return (
        <span className="inline-flex items-center gap-2">
            <SpikeMark className="h-4 w-4 text-foreground" />
            <span className="font-display text-xl font-medium tracking-[-0.02em]">CodePuppet</span>
        </span>
    );
}

export function localImportBindings(declaration) {
    const bindings = new Set();
    const add = (binding) => {
        if (binding && /^[A-Za-z_$][\w$]*$/.test(binding))
            bindings.add(binding);
    };
    const defaultBinding = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from\b)/.exec(declaration)?.[1];
    add(defaultBinding);
    add(/\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(declaration)?.[1]);
    const namedBindings = /\{([^}]*)\}/.exec(declaration)?.[1];
    for (const namedBinding of namedBindings?.split(",") ?? []) {
        const [imported, local] = namedBinding
            .trim()
            .replace(/^type\s+/, "")
            .split(/\s+as\s+/);
        add(local ?? imported);
    }
    return [...bindings];
}
export function declarationRange(content, position) {
    const start = content.lastIndexOf("\n", position) + 1;
    const nextNewline = content.indexOf("\n", position);
    return [start, nextNewline === -1 ? content.length : nextNewline];
}
//# sourceMappingURL=reference-analysis-declarations.js.map
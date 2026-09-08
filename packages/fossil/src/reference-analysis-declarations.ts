function addBinding(bindings: Set<string>, binding: string | undefined): void {
  if (binding && /^[A-Za-z_$][\w$]*$/.test(binding)) bindings.add(binding);
}

function namedBindings(declaration: string): string[] {
  const named = /\{([^}]*)\}/.exec(declaration)?.[1];
  if (named === undefined) return [];
  return named.split(",");
}

export function localImportBindings(declaration: string): string[] {
  const bindings = new Set<string>();
  const defaultBinding = /^\s*import\s+([A-Za-z_$][\w$]*)\s*(?:,|from\b)/.exec(declaration)?.[1];
  addBinding(bindings, defaultBinding);
  addBinding(bindings, /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(declaration)?.[1]);
  for (const namedBinding of namedBindings(declaration)) {
    const [imported, local] = namedBinding
      .trim()
      .replace(/^type\s+/, "")
      .split(/\s+as\s+/);
    addBinding(bindings, local ?? imported);
  }
  return [...bindings];
}

export function declarationRange(content: string, position: number): readonly [number, number] {
  const start = content.lastIndexOf("\n", position) + 1;
  const nextNewline = content.indexOf("\n", position);
  return [start, nextNewline === -1 ? content.length : nextNewline];
}

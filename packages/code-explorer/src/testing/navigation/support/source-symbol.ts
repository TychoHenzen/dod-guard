export function sourceSymbol(options: {
  id: string;
  name: string;
  kind: string;
  path: string;
  line: number;
  endCharacter: number;
}) {
  const range = {
    start: { line: options.line, character: 0 },
    end: { line: options.line, character: options.endCharacter },
  };
  return {
    id: options.id,
    name: options.name,
    language: "rust" as const,
    kind: options.kind,
    location: { path: options.path, range },
  };
}

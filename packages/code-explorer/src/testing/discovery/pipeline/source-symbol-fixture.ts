import type { SymbolIdentity } from "../../../semantic/contracts/contract.js";
export function sourceSymbol(
  name: string,
  path: string,
  options: { id: string; kind?: string },
): SymbolIdentity {
  const range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: name.length },
  };
  return {
    id: options.id,
    name,
    language: "rust",
    kind: options.kind ?? "function",
    location: { path, range },
  };
}

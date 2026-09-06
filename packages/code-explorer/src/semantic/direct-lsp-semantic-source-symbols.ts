import type { Language } from "./contract.js";
import { csharpSourceSymbols } from "./direct-lsp-semantic-csharp-symbols.js";
import { sourceSymbol } from "./direct-lsp-semantic-source-symbol.js";

export function sourcePathSymbols(
  language: Language,
  source: string,
  uri: string,
): Record<string, unknown>[] {
  if (language === "python") return pythonSourceSymbols(source, uri);
  if (language === "csharp") return csharpSourceSymbols(source, uri);
  return [];
}

function pythonSourceSymbols(
  source: string,
  uri: string,
): Record<string, unknown>[] {
  return source
    .split(/\r?\n/)
    .flatMap((line, lineNumber) => pythonSymbolAt(line, lineNumber, uri));
}

function pythonSymbolAt(
  line: string,
  lineNumber: number,
  uri: string,
): Record<string, unknown>[] {
  const match = /^(\s*)(?:(async)\s+)?(def|class)\s+([A-Za-z_]\w*)/.exec(line);
  if (!match) return [];
  return [
    sourceSymbol({
      name: match[4],
      kind: match[3] === "class" ? 5 : 12,
      character: line.indexOf(match[4], match[1].length),
      lineNumber,
      uri,
    }),
  ];
}

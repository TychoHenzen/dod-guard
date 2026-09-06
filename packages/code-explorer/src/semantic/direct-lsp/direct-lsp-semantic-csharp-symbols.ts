export function csharpSourceSymbols(
  source: string,
  uri: string,
): Record<string, unknown>[] {
  return source
    .split(/\r?\n/)
    .flatMap((line, lineNumber) => csharpSymbolsAt(line, lineNumber, uri));
}

function csharpSymbolsAt(
  line: string,
  lineNumber: number,
  uri: string,
): Record<string, unknown>[] {
  return [
    csharpTypeSymbol(line, lineNumber, uri),
    csharpMethodSymbol(line, lineNumber, uri),
  ].filter((symbol): symbol is Record<string, unknown> => symbol !== undefined);
}

function csharpTypeSymbol(
  line: string,
  lineNumber: number,
  uri: string,
): Record<string, unknown> | undefined {
  const match = /\b(class|interface|struct|enum)\s+([A-Za-z_]\w*)/.exec(line);
  if (!match) return undefined;
  return sourceSymbol({
    name: match[2],
    kind: match[1] === "interface" ? 11 : 5,
    character: line.indexOf(match[2]),
    lineNumber,
    uri,
  });
}

const CSHARP_METHOD = new RegExp(
  String.raw`^\s*(?:(?:public|private|protected|internal|static|` +
    String.raw`virtual|override|abstract|async|sealed|new|partial|` +
    String.raw`extern)\s+)*` +
    String.raw`(?:[A-Za-z_][\w<>[\],.?]*\s+)([A-Za-z_]\w*)\s*\(`,
);

function csharpMethodSymbol(
  line: string,
  lineNumber: number,
  uri: string,
): Record<string, unknown> | undefined {
  const match = CSHARP_METHOD.exec(line);
  if (!match) return undefined;
  return sourceSymbol({
    name: match[1],
    kind: 6,
    character: line.indexOf(match[1]),
    lineNumber,
    uri,
  });
}

import { sourceSymbol } from "./direct-lsp-semantic-source-symbol.js";

export function sourceSymbol(input: {
  name: string;
  kind: number;
  character: number;
  lineNumber: number;
  uri: string;
}): Record<string, unknown> {
  return {
    name: input.name,
    kind: input.kind,
    location: symbolLocation(input),
  };
}

function symbolLocation(input: {
  name: string;
  character: number;
  lineNumber: number;
  uri: string;
}): Record<string, unknown> {
  return {
    uri: input.uri,
    range: {
      start: {
        line: input.lineNumber,
        character: input.character,
      },
      end: {
        line: input.lineNumber,
        character: input.character + input.name.length,
      },
    },
  };
}

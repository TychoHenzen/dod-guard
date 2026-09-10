export function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

export function toolError(err: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `ERROR: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
  };
}

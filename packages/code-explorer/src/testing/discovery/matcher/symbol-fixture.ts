export const symbol = (
  name: string,
  path: string,
  options: { identity?: string; kind?: string } = {},
) => ({
  type: "symbol" as const,
  name,
  path,
  kind: options.kind ?? "function",
  identity: options.identity ?? name,
});

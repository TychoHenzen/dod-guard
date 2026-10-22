import { KINDS } from "./kind-tables.mjs";
import { detectKind } from "./kinds.mjs";

export function parseArgs(argv) {
  const args = { positional: [] };
  for (const item of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(item);
    if (match) {
      args[match[1]] = match[2] ?? "true";
    } else {
      args.positional.push(item);
    }
  }
  return args;
}

export function resolveKind(args, target, text) {
  if (!args.kind) return detectKind(target, text);
  if (!Object.hasOwn(KINDS, args.kind)) return null;
  return args.kind;
}

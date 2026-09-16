import { sourceSymbol } from "./source-symbol-fixture.js";
export function symbol(kind: string, path: string) {
  return sourceSymbol("helper", path, { id: `${kind}:${path}`, kind });
}

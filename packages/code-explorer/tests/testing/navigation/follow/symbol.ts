import { sourceSymbol } from "../support/source-symbol.js";
export function symbol(options: {
  id: string;
  name: string;
  kind: string;
  path: string;
  line: number;
}) {
  return sourceSymbol({ ...options, endCharacter: 4 });
}

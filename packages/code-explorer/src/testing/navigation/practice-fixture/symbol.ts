import { sourceSymbol } from "../support/source-symbol.js";
export function symbol(options: {
  id: string;
  name: string;
  kind: string;
  line: number;
}) {
  return sourceSymbol({
    ...options,
    path: "src/navigation.rs",
    endCharacter: 6,
  });
}

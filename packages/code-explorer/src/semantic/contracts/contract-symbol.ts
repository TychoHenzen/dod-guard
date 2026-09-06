import type { Language } from "./contract-language.js";

export type SymbolIdentity = {
  id: string;
  name: string;
  qualified_name?: string;
  language: Language;
  kind: string;
  location: {
    path: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
};

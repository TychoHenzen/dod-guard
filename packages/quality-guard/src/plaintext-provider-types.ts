import type { TextstatResult } from "./plaintext-textstat-result.js";

export type TextstatProvider = (text: string) => TextstatResult;

import type { TextstatMeasures } from "./plaintext-textstat-measures.js";

export type TextstatResult =
  | {
      status: "ok";
      measures: TextstatMeasures;
    }
  | {
      status: "unavailable";
      reason: string;
    };

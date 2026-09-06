import type { RuntimeAdapterInput } from "./runtime-adapter-input.js";

export type RuntimeAdapterRecordInput = Omit<
  RuntimeAdapterInput,
  "capabilities"
>;

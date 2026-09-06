import type {
  BackendStatus,
  Language,
  RelationCapabilities,
} from "./contract.js";
import type { LanguageAdapterOptions } from "./language-adapter-options.js";
import { createBackendStatus } from "./language-adapter-status.js";

export function createStatusReader(input: {
  language: Language;
  options: LanguageAdapterOptions;
  capabilities: () => RelationCapabilities;
  now: () => number;
}): () => BackendStatus {
  let initializingSince: number | undefined;
  let lastSignature: string | undefined;
  let lastTransitionTime = input.now();
  return () => {
    const current = createBackendStatus({
      ...input,
      capabilities: input.capabilities(),
      initializingSince,
    });
    initializingSince = current.initializingSince;
    const signature = [
      current.status.state,
      current.status.failure_code ?? "",
    ].join(":");
    if (lastSignature === undefined || signature !== lastSignature) {
      lastSignature = signature;
      lastTransitionTime = input.now();
    }
    return {
      ...current.status,
      last_transition_time: lastTransitionTime,
    };
  };
}

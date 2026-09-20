import type { Evidence } from "../../src/test-quality/types.js";
import {
  signalBugs,
  signalCoverage,
  signalFailures,
  signalTiming,
} from "./test-quality-signal-data.js";
import { signalSources } from "./test-quality-sources.js";
import { signalTests } from "./test-quality-tests.js";

export function evidenceWithSignals(): Evidence {
  return {
    schemaVersion: 1,
    environment: "ci-linux-node22",
    sources: structuredClone(signalSources),
    tests: structuredClone(signalTests),
    coverage: structuredClone(signalCoverage),
    bugs: structuredClone(signalBugs),
    failures: structuredClone(signalFailures),
    timing: structuredClone(signalTiming),
  };
}

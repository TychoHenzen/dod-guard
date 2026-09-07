import { rmSync } from "node:fs";
import { it } from "node:test";
import { createServer } from "../../../index.js";
import { createNativeProjectRoot } from "../../../semantic/api/public-api.js";
import * as eviction from "./assert-evicted-practice-handle.js";
import { assertPracticeFollow } from "./assert-practice-follow.js";
import { assertPracticeHistory } from "./assert-practice-history.js";
import { assertPracticeSearch } from "./assert-practice-search.js";
import { fixtureRoot } from "./fixture-root.js";
import { focusPracticeSource } from "./focus-practice-source.js";
import { practiceAdapter } from "./practice-adapter.js";

it(
  "runs fuzzy search through focus, follow, history, and " +
    "stale-handle rejection",
  async () => {
    const root = fixtureRoot();
    try {
      const server = createServer({
        projectRoot: createNativeProjectRoot(root),
        adapters: [practiceAdapter()],
      });
      await assertPracticeSearch(server);
      const { sessionId, source, handle } = await focusPracticeSource(server);
      await assertPracticeFollow(server, { sessionId, source, handle });
      await assertPracticeHistory(server, sessionId, source);
      await eviction.assertEvictedPracticeHandle(server, {
        sessionId,
        source,
        handle,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

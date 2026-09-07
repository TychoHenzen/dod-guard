import { it } from "node:test";
import * as generations from "../../freshness/project-generation-scheduler.js";
import { assertFailedRetention } from "./assert-failed-retention.js";
import { assertSavedGenerations } from "./assert-saved-generations.js";
import { assertSharedPublication } from "./assert-shared-publication.js";

it(
  "runs the one-process freshness practice fixture through " +
    "changes, shared refresh, publication, and failed-refresh " +
    "retention",
  async () => {
    const { freshness } = await assertSavedGenerations();
    const scheduler = new generations.ProjectGenerationScheduler(freshness);
    await assertSharedPublication(scheduler, freshness);
    const { retained } = await assertFailedRetention(scheduler, freshness);
    console.log(
      JSON.stringify({
        save_rename_delete: [1, 2, 3],
        pending_analysis: 4,
        concurrent_sessions: "coalesced",
        successful_refresh: 4,
        failed_refresh_retained: retained,
      }),
    );
  },
);

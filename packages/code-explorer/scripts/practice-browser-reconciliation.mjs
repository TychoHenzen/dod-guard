import {
  assertStaleView,
  refresh,
  refocus,
  saveAndReconcile,
} from "./practice-browser-reconciliation-steps.mjs";

export async function reconcile({
  context,
  root,
  oracle,
  evidence,
  startGeneration,
  candidate,
  focus,
  handle,
}) {
  await saveAndReconcile({
    context,
    root,
    oracle,
    startGeneration,
    evidence,
  });
  await assertStaleView({ context, focus, handle, evidence });
  await refocus({ context, candidate, evidence });
  await refresh({ context, evidence });
}

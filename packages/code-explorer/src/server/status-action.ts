import type { ServerActionContext } from "./action-context.js";
import type { CodeExplorerEnvelope } from "./envelope.js";
import { createEnvelope } from "./envelope.js";
import { statusData, statusEnvelopeState } from "./status-data.js";

export function handleStatus(
  context: ServerActionContext,
): CodeExplorerEnvelope {
  return createEnvelope(
    context.freshness,
    statusEnvelopeState(context),
    statusData(context),
  );
}

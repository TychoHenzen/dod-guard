import type {
  LanguageAdapter,
  RelationName,
  RelationResult,
} from "../semantic/api/public-api.js";
import type { BackendOperation } from "./semantic-operations.js";
import { throwBackendLimitFailure } from "./semantic-operations.js";

export async function collectRelations({
  adapters,
  relation,
  symbolId,
  run,
}: {
  adapters: readonly LanguageAdapter[];
  relation: RelationName;
  symbolId: string;
  run: BackendOperation;
}) {
  const supported = adapters.filter(
    (adapter) => adapter.status().capabilities[relation].state === "ready",
  );
  const replies = await Promise.allSettled(
    supported.map((adapter) =>
      run(() => adapter.request({ operation: relation, symbol_id: symbolId })),
    ),
  );
  const results = replies.flatMap((reply, index) =>
    reply.status === "fulfilled" && reply.value.operation === relation
      ? [{ adapter: supported[index], result: reply.value as RelationResult }]
      : [],
  );
  if (results.length === 0) throwBackendLimitFailure(replies);
  return results;
}

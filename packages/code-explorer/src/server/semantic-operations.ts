import type { LanguageAdapter } from "../semantic/api/public-api.js";

export type BackendOperation = <T>(operation: () => Promise<T>) => Promise<T>;

export async function collectSemanticSymbols(adapters: readonly LanguageAdapter[], query: string, run: BackendOperation) {
  const replies = await Promise.allSettled(
    adapters.map((adapter) => run(() => adapter.request({ operation: "search", query }))),
  );
  const symbols = replies.flatMap((reply) =>
    reply.status === "fulfilled" && reply.value.operation === "search" ? reply.value.symbols : [],
  );
  const failure = replies.find((reply): reply is PromiseRejectedResult => reply.status === "rejected")?.reason;
  return { symbols, failure };
}

export async function collectFocusedSymbol(adapters: readonly LanguageAdapter[], symbolId: string, run: BackendOperation) {
  const replies = await Promise.allSettled(
    adapters.map((adapter) => run(() => adapter.request({ operation: "focus", symbol_id: symbolId }))),
  );
  const focused = replies.find(
    (reply): reply is PromiseFulfilledResult<Extract<Awaited<ReturnType<LanguageAdapter["request"]>>, { operation: "focus" }>> =>
      reply.status === "fulfilled" && reply.value.operation === "focus",
  )?.value;
  if (focused) return focused;
  throwBackendLimitFailure(replies);
  return undefined;
}

export function throwBackendLimitFailure(replies: readonly PromiseSettledResult<unknown>[]): void {
  const failed = replies.find((reply): reply is PromiseRejectedResult => reply.status === "rejected");
  if (failed) throw failed.reason;
}

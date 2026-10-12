import type { LanguageAdapter } from "../adapters/language-adapter.js";
import { createLanguageAdapter } from "../adapters/language-adapter-factory.js";
import type {
  Language,
  RelationCapabilities,
  SemanticRequest,
  SemanticResult,
} from "../contracts/contract.js";

export const LANGUAGE_NOT_PRESENT = "language_not_present";

type LazyState = {
  inner?: LanguageAdapter;
  absent: boolean;
  starting?: Promise<void>;
  failure?: string;
  closed: boolean;
};

export type LazyAdapterInput = {
  language: Language;
  backendName: string;
  capabilities: RelationCapabilities;
  isPresent: () => Promise<boolean>;
  build: () => LanguageAdapter;
  now?: () => number;
};

/**
 * Construction does no work. The first start checks presence and builds the
 * backend at most once, so a language with no sources never runs its backend.
 */
export function createLazyRuntimeAdapter(
  input: LazyAdapterInput,
): LanguageAdapter {
  const state: LazyState = { absent: false, closed: false };
  const placeholder = createLanguageAdapter(input.language, {
    backend: {
      readiness: () => placeholderReadiness(state),
      query: rejectUnavailable,
    },
    compatible: true,
    backend_name: input.backendName,
    backend_version: "unobserved",
    discovery_source: "server_path",
    capabilities: input.capabilities,
    ...(input.now ? { now: input.now } : {}),
  });
  const start = () => startLazy(state, input);
  return {
    status: () => (state.inner ?? placeholder).status(),
    request: (request) => requestLazy(state, start, request),
    start,
    refresh: () => refreshLazy(state, start),
    shutdown: () => shutdownLazy(state),
  };
}

function placeholderReadiness(state: LazyState) {
  if (state.failure !== undefined)
    return { state: "failed" as const, failure_code: state.failure };
  return state.absent
    ? { state: "unavailable" as const, failure_code: LANGUAGE_NOT_PRESENT }
    : { state: "initializing" as const };
}

async function rejectUnavailable(): Promise<never> {
  throw new Error("backend_unavailable");
}

function startLazy(state: LazyState, input: LazyAdapterInput): Promise<void> {
  // Matches a disposed backend: a stopped adapter never starts again.
  if (state.closed) return Promise.reject(new Error("backend_unavailable"));
  state.starting ??= runStart(state, input).catch((error: unknown) => {
    state.starting = undefined;
    throw error;
  });
  return state.starting;
}

async function runStart(
  state: LazyState,
  input: LazyAdapterInput,
): Promise<void> {
  if (state.closed) throw new Error("backend_unavailable");
  if (!state.inner) {
    const present = await input.isPresent();
    if (state.closed) throw new Error("backend_unavailable");
    // A refresh that ran while presence was pending may already have built.
    if (!state.inner) {
      state.absent = !present;
      if (!present) return;
      state.inner = buildRecorded(state, input);
    }
  }
  await state.inner?.start?.();
}

function buildRecorded(
  state: LazyState,
  input: LazyAdapterInput,
): LanguageAdapter {
  state.failure = undefined;
  try {
    return input.build();
  } catch (error) {
    // Without this the placeholder would sit in initializing until its timeout.
    state.failure = error instanceof Error ? error.message : "backend_failed";
    throw error;
  }
}

async function requestLazy(
  state: LazyState,
  start: () => Promise<void>,
  request: SemanticRequest,
): Promise<SemanticResult> {
  await start();
  if (!state.inner) throw new Error("backend_unavailable");
  return state.inner.request(request);
}

async function refreshLazy(
  state: LazyState,
  start: () => Promise<void>,
): Promise<void> {
  if (state.closed) return;
  if (state.starting) {
    try {
      await state.starting;
    } catch {
      // The failed start is retried below.
    }
  }
  if (state.inner) {
    await state.inner.refresh?.();
    return;
  }
  state.starting = undefined;
  await start();
}

async function shutdownLazy(state: LazyState): Promise<void> {
  state.closed = true;
  await state.inner?.shutdown?.();
}

// readiness.mjs - bounded, incremental parser for a Code Explorer readiness line.

const BYTE_LIMIT = 65_536;
const DEADLINE_MS = 30_000;
const READINESS = /^Code Explorer: (\S+)$/;

export function validateExplorerUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const port = Number(url.port);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    port < 4410 ||
    port > 4429 ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  return url.href;
}

export function createReadinessParser({ now = () => performance.now(), startedAt = now() } = {}) {
  const streams = new Map();
  let result = null;

  function fail(code) {
    if (!result) result = { error: code };
    return result;
  }

  function feed(stream, chunk) {
    if (result) return result;
    if (now() - startedAt >= DEADLINE_MS) return fail("code_explorer_start_timeout");
    const state = streams.get(stream) ?? { bytes: 0, decoder: new TextDecoder(), text: "" };
    streams.set(stream, state);
    const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
    state.bytes += bytes.byteLength;
    if (state.bytes > BYTE_LIMIT) return fail("code_explorer_output_limit");
    state.text += state.decoder.decode(bytes, { stream: true });
    for (;;) {
      const end = state.text.indexOf("\n");
      if (end < 0) break;
      const line = state.text.slice(0, end).replace(/\r$/, "");
      state.text = state.text.slice(end + 1);
      const match = READINESS.exec(line);
      if (match) {
        const url = validateExplorerUrl(match[1]);
        if (!url) return fail("invalid_code_explorer_url");
        result = { url, state: "open" };
        return result;
      }
    }
    return null;
  }

  function deadline() {
    return result ?? (now() - startedAt >= DEADLINE_MS ? fail("code_explorer_start_timeout") : null);
  }

  function end() {
    if (result) return result;
    for (const state of streams.values()) state.text += state.decoder.decode();
    return fail("code_explorer_start_failed");
  }

  return { feed, deadline, end };
}

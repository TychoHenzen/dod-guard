export type SourceHandle = {
  handle: string;
  start: number;
  end: number;
  relations: readonly string[];
};

export type FocusedSource = {
  view_id: string;
  symbol: { name: string; kind: string; path: string; symbol_id: string };
  generation: number;
  body: string;
  handles: readonly SourceHandle[];
  returned_bytes: number;
  total_bytes: number;
  limit_bytes: number;
  truncated: boolean;
};

type Segment = { text: string; handle?: SourceHandle };

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validBoundary(body: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > body.length) return false;
  if (offset === 0 || offset === body.length) return true;
  const before = body.charCodeAt(offset - 1);
  const after = body.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

function validateHandles(body: string, handles: readonly SourceHandle[]): readonly SourceHandle[] | undefined {
  const ordered = [...handles].sort((left, right) => left.start - right.start || left.end - right.end);
  let end = 0;
  for (const handle of ordered) {
    if (handle.start < end || handle.start >= handle.end) return undefined;
    if (!(validBoundary(body, handle.start) && validBoundary(body, handle.end))) return undefined;
    end = handle.end;
  }
  return ordered;
}

function sourceSegments(body: string, handles: readonly SourceHandle[]): readonly Segment[] | undefined {
  const validated = validateHandles(body, handles);
  if (!validated) return undefined;
  const segments: Segment[] = [];
  let offset = 0;
  for (const handle of validated) {
    if (offset < handle.start) segments.push({ text: body.slice(offset, handle.start) });
    segments.push({ text: body.slice(handle.start, handle.end), handle });
    offset = handle.end;
  }
  if (offset < body.length || segments.length === 0) segments.push({ text: body.slice(offset) });
  return segments;
}

function renderTextWithLineNumbers(segments: readonly Segment[], viewId: string): string {
  let line = 1;
  const rendered: string[] = [];
  for (const segment of segments) {
    const fragments = segment.text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
    for (const fragment of fragments) {
      if (fragment.length === 0) continue;
      const text = escapeText(fragment);
      const linePrefix = `<span class="source-line" data-line="${line}"></span>`;
      if (!segment.handle) rendered.push(`${linePrefix}${text}`);
      else {
        const relations = segment.handle.relations.map(escapeText).join(" ");
        rendered.push(
          `${linePrefix}<mark data-handle="${escapeText(segment.handle.handle)}" data-view-id="${escapeText(viewId)}" data-relations="${relations}">${text}</mark>`,
        );
      }
      if (/\r\n|\r|\n$/.test(fragment)) line += 1;
    }
  }
  return rendered.join("");
}

/** Renders service source exactly as escaped UTF-16 text after validating all selectable spans. */
export function renderFocusedSource(source: FocusedSource): string {
  const segments = sourceSegments(source.body, source.handles);
  if (!segments) return '<section data-state="invalid_browser_view">invalid_browser_view</section>';
  const metadata = `${escapeText(source.symbol.name)} · ${escapeText(source.symbol.kind)} · ${escapeText(source.symbol.path)} · ${escapeText(source.symbol.symbol_id)} · generation ${source.generation}`;
  const counts = `${source.returned_bytes} returned bytes · ${source.total_bytes} total bytes · ${source.limit_bytes} byte limit`;
  return `<article class="focused-source" data-view-id="${escapeText(source.view_id)}" data-truncated="${source.truncated}"><header><p>${metadata}</p><p>${counts}</p></header><pre>${renderTextWithLineNumbers(segments, source.view_id)}</pre></article>`;
}

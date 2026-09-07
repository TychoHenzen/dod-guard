import { escapeText } from "./escape-text.js";
import type { FocusedSource } from "./focused-source.js";
import type { SourceSegment } from "./source-segment.js";
import { sourceSegments } from "./source-segments.js";

function renderFragment(options: {
  fragment: string;
  segment: SourceSegment;
  line: number;
  viewId: string;
}): string {
  const { fragment, segment, line, viewId } = options;
  const prefix = `<span class="source-line" data-line="${line}"></span>`;
  const text = escapeText(fragment);
  if (!segment.handle) return `${prefix}${text}`;
  const relations = segment.handle.relations.map(escapeText).join(" ");
  const handle = escapeText(segment.handle.handle);
  const view = escapeText(viewId);
  return (
    `${prefix}<mark data-handle="${handle}" data-view-id="${view}" ` +
    `data-relations="${relations}">${text}</mark>`
  );
}

function renderTextWithLineNumbers(
  segments: readonly SourceSegment[],
  viewId: string,
): string {
  let line = 1;
  const rendered: string[] = [];
  for (const segment of segments) {
    const result = renderSegment(segment, line, viewId);
    rendered.push(...result.html);
    line = result.nextLine;
  }
  return rendered.join("");
}

function renderSegment(
  segment: SourceSegment,
  line: number,
  viewId: string,
): { html: string[]; nextLine: number } {
  const fragments = segment.text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  const html: string[] = [];
  let nextLine = line;
  for (const fragment of fragments) {
    if (fragment.length === 0) continue;
    html.push(renderFragment({ fragment, segment, line: nextLine, viewId }));
    if (/\r\n|\r|\n$/.test(fragment)) nextLine += 1;
  }
  return { html, nextLine };
}

/** Renders service source exactly as escaped UTF-16 text after validating all
 * selectable spans.
 */
export function renderFocusedSource(source: FocusedSource): string {
  const segments = sourceSegments(source.body, source.handles);
  if (!segments)
    return (
      '<section data-state="invalid_browser_view">' +
      "invalid_browser_view</section>"
    );
  const metadata =
    `${escapeText(source.symbol.name)} Ã‚Â· ` +
    `${escapeText(source.symbol.kind)} Ã‚Â· ` +
    `${escapeText(source.symbol.path)} Ã‚Â· ` +
    `${escapeText(source.symbol.symbol_id)} Ã‚Â· ` +
    `generation ${source.generation}`;
  const counts =
    `${source.returned_bytes} returned bytes Ã‚Â· ` +
    `${source.total_bytes} total bytes Ã‚Â· ` +
    `${source.limit_bytes} byte limit`;
  const viewId = escapeText(source.view_id);
  const body = renderTextWithLineNumbers(segments, source.view_id);
  return (
    `<article class="focused-source" data-view-id="${viewId}" ` +
    `data-truncated="${source.truncated}"><header><p>${metadata}</p>` +
    `<p>${counts}</p></header><pre>${body}</pre></article>`
  );
}

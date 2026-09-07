import type { FocusHandle } from "../../../navigation/focus-view.js";
export function focused(options: {
  symbolId: string;
  name: string;
  kind: string;
  path: string;
  body: string;
  handles?: FocusHandle[];
}) {
  const { symbolId, name, kind, path, body, handles = [] } = options;
  return {
    schema_version: 1,
    project_generation: 1,
    state: "ready",
    data: {
      view_id: `view-${name.replace(".ts", "")}`,
      project_generation: 1,
      symbol_id: symbolId,
      name,
      kind,
      path,
      content: content(body),
      handles,
    },
  };
}

function content(body: string) {
  return {
    body,
    truncated: false,
    limit_bytes: 32_768,
    returned_bytes: Buffer.byteLength(body),
    total_bytes: Buffer.byteLength(body),
  };
}

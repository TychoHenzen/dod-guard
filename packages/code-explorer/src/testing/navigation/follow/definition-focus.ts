import { createServer } from "../../../index.js";

export function definitionFocus(
  response: Exclude<
    Awaited<ReturnType<ReturnType<typeof createServer>["call"]>>,
    { code: unknown }
  >,
) {
  const focus = response.data.focus as {
    relation: string;
    relation_source: string;
    backend_name: string;
    display_name: string;
    path: string;
    kind: string;
    range: unknown;
    external: boolean;
    handle: string;
    view_id: string;
  };
  return { focus };
}

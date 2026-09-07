import type { BrowserFocusNavigation } from "./focus-navigation.js";
import { BrowserRelationsController } from "./relation-controller.js";
import { browserRelations, isBrowserRelation } from "./relation-data.js";
import { followRelation } from "./relation-follow.js";
import type { BrowserStorage } from "./session.js";
import type { FocusedSource } from "./source.js";

export function createRelationController(
  storage: BrowserStorage,
  source: FocusedSource,
  handle: FocusedSource["handles"][number],
): BrowserRelationsController {
  const supported = handle.relations.filter(isBrowserRelation);
  return new BrowserRelationsController(
    {
      view_id: source.view_id,
      handle: handle.handle,
      supported,
      unavailable: browserRelations.filter(
        (relation) => !supported.includes(relation),
      ),
    },
    (request) => followRelation(storage, request),
  );
}

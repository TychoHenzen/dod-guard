import type { RelationCandidate } from "./relation-candidate.js";
import type { BrowserFocusNavigation } from "./focus-navigation.js";
import { relationFocus } from "./relation-focus.js";

export function navigateRelationCandidate(
  navigation: BrowserFocusNavigation,
  candidate: RelationCandidate,
): Promise<boolean> {
  const focus = relationFocus(candidate);
  if (focus) return Promise.resolve(navigation.selectView(focus));
  if (candidate.symbol_id)
    return navigation.selectRelation({ symbol_id: candidate.symbol_id });
  return Promise.resolve(false);
}

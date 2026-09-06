import { showActionStatus } from "./application-events.js";
import type { BrowserFocusNavigation } from "./focus-navigation.js";
import type { BrowserRelationView } from "./relations.js";

/** Coordinates stale-safe search focus with the relation view refresh. */
export class ApplicationFocusController {
  private latestFocusRequest = 0;

  constructor(
    private readonly navigation: BrowserFocusNavigation,
    private readonly relationView: BrowserRelationView,
  ) {}

  async focusSymbol(symbolId: string): Promise<void> {
    const request = ++this.latestFocusRequest;
    const selected = await this.navigation.selectSearch({ symbol_id: symbolId });
    if (request !== this.latestFocusRequest) return;
    if (selected) {
      this.relationView.renderFocusedView();
      showActionStatus("ready");
      return;
    }
    showActionStatus(this.navigation.state().error ?? "backend_unavailable");
  }
}

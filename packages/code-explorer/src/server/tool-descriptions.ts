import type { ToolName } from "./tool-name.js";

export const toolDescriptions: Record<ToolName, string> = {
  code_search:
    "Search the frozen project for symbols and files, " +
    "or return project landmarks for an empty query.",
  code_focus:
    "Open one search result in a bounded source view " +
    "owned by an active navigation session.",
  code_follow:
    "Follow one visible handle from a current view " +
    "through a named semantic relation.",
  code_history:
    "Restore a prior or next immutable view, or list recent views " +
    "in the active navigation session.",
  code_status:
    "Read workspace and backend status, start a navigation session, " +
    "or refresh derived navigation data.",
};

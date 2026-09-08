export const toolNames = [
  "code_search",
  "code_focus",
  "code_follow",
  "code_history",
  "code_status",
] as const;

export type ToolName = (typeof toolNames)[number];

export function isToolName(name: string): name is ToolName {
  return toolNames.includes(name as ToolName);
}

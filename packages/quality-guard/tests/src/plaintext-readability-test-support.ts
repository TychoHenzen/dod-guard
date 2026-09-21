export const easyText =
  "This short guide explains the change in plain language. " +
  "Each sentence has a clear subject and a direct verb. " +
  "Readers can scan the steps, understand the reason, and choose the next action. " +
  "The wording avoids dense terms and keeps the main idea visible.";

export function textstatResponse() {
  return {
    pid: 1,
    output: [],
    stdout: JSON.stringify({
      measures: { fleschReadingEase: 70, fleschKincaidGrade: 8 },
    }),
    stderr: "",
    status: 0,
    signal: null,
  };
}

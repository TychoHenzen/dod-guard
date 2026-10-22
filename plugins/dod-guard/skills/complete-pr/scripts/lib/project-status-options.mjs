import { runGh } from "./gh-runner.mjs";
import { buildProjectFieldsCommand } from "./project-status-commands.mjs";
import { nameOrNull, parseArrayResponse, resolveStatusField } from "./project-status-fields.mjs";
import { requireProjectNumber, requireText } from "./project-status-request.mjs";

// Read-only: stages list the Status options here so none writes its own reader.
function listStatusOptions({ owner, projectNumber, statusFieldId, commandRunner = runGh }) {
  requireText(owner, "owner");
  requireProjectNumber(projectNumber);
  requireText(statusFieldId, "statusFieldId");
  const fields = parseArrayResponse(commandRunner(buildProjectFieldsCommand(owner, projectNumber)), "Project fields");
  const statusField = resolveStatusField(fields, statusFieldId);
  return statusField.options.map((option) => {
    const name = nameOrNull(option);
    if (name === null) {
      throw new Error(`Status option ${String(option?.id ?? "")} has no readable name.`);
    }
    return { id: String(option.id), name };
  });
}

export { listStatusOptions };

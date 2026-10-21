import { githubResponseContractError } from "./gh-runner.mjs";
import { statusValueName } from "./project-status-value.mjs";

const ITEM_STATUS_STOPS = {
  "not-a-name": "exactly one non-blank Status field/value",
  blank: "exactly one non-blank Status field/value",
  disagree: "one non-contradictory Status field/value",
};

function isStatusField(field, statusFieldId) {
  return (
    String(field?.id ?? "") === String(statusFieldId) &&
    typeof field?.name === "string" &&
    field.name.toLowerCase() === "status"
  );
}

// A contract stop for a malformed Status value; any other error passes through unchanged.
function itemStatusValueName(value, endpoint) {
  try {
    return statusValueName(value);
  } catch (error) {
    const stop = ITEM_STATUS_STOPS[error?.statusValueReason];
    if (stop !== undefined) {
      throw githubResponseContractError(endpoint, stop);
    }
    throw error;
  }
}

// The Status name of one item read with ?fields=<statusFieldId>. The item must carry exactly that one
// field, and its value must flatten to one name; an absent value is a stop here, not null.
export function projectStatusName(item, statusFieldId, endpoint) {
  if (!Array.isArray(item?.fields) || item.fields.length !== 1) {
    throw githubResponseContractError(endpoint, "exactly one Status field/value");
  }
  const [statusField] = item.fields;
  if (!isStatusField(statusField, statusFieldId)) {
    throw githubResponseContractError(endpoint, "exactly one Status field/value");
  }

  const name = itemStatusValueName(statusField.value, endpoint);
  if (name === null) {
    throw githubResponseContractError(endpoint, "exactly one non-blank Status field/value");
  }
  return name;
}

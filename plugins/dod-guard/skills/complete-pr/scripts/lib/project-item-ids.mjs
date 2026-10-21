import { githubResponseContractError, githubResponseError } from "./gh-runner.mjs";

export function isPresent(value) {
  return value !== undefined && value !== null;
}

export function isBlankId(value) {
  return value === undefined || value === null || String(value).trim().length === 0;
}

export function projectItemId(item, endpoint) {
  const id = item?.id;
  if (isBlankId(id)) {
    throw githubResponseError(endpoint, "items with IDs");
  }
  return String(id);
}

export function projectItemIssueNumber(item, endpoint) {
  const value = item?.content?.number;
  const number = Number(value);
  if (value === undefined || value === null || !Number.isInteger(number) || number <= 0) {
    throw githubResponseContractError(endpoint, "a valid issue number");
  }
  return number;
}

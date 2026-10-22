import assert from "node:assert/strict";
import { ITEM_LIST_PREFIX, ITEM_READ_PREFIX } from "./project-status-data.mjs";

function isEndpoint(value) {
  return typeof value === "string" && value.startsWith("users/");
}

export function endpointOf(args) {
  return args.find(isEndpoint);
}

export function isListRead(args) {
  return endpointOf(args)?.startsWith(ITEM_LIST_PREFIX) === true;
}

export function isSingleItemRead(args) {
  const read = endpointOf(args)?.startsWith(ITEM_READ_PREFIX) === true;
  return read && !args.includes("PATCH");
}

export function patchCalls(calls) {
  return calls.filter((args) => args.includes("PATCH"));
}

export function patchedIds(calls) {
  return patchCalls(calls).map((args) => args[3].split("/").at(-1));
}

export function assertPatchCount(calls, expected, label) {
  assert.equal(patchCalls(calls).length, expected, label);
}

export function itemListCalls(calls) {
  const isItems = (value) => String(value).includes("/items?");
  return calls.filter((args) => args.some(isItems));
}

export function listReads(calls) {
  const isList = (value) => String(value).startsWith(ITEM_LIST_PREFIX);
  return calls.filter((args) => args.some(isList));
}

export function singleItemReads(calls) {
  const isRead = (value) => String(value).startsWith(ITEM_READ_PREFIX);
  return calls.filter((args) => !args.includes("PATCH") && args.some(isRead));
}

function isPaginated(args) {
  return args.includes("--paginate") && args.includes("--slurp");
}

function hasPageParameter(args) {
  return args.some((value) => /[?&]page=/.test(String(value)));
}

export function assertPaginatedReads(reads) {
  assert.equal(reads.every(isPaginated), true);
  assert.equal(reads.some(hasPageParameter), false);
}

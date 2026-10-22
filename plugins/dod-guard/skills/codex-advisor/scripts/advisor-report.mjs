import { readFile } from "node:fs/promises";
import { stageFailure } from "./advisor-evidence.mjs";

const isNotObject = (response) => !response || Array.isArray(response) || typeof response !== "object";
const hasExtraKeys = (response) => Object.keys(response).some((key) => key !== "advice");
const lacksAdvice = (response) => typeof response.advice !== "string" || !/\S/.test(response.advice);

// Checked in order: each check assumes the ones before it passed.
const ADVICE_CHECKS = [
  [isNotObject, "Codex advisor output is not a JSON object"],
  [hasExtraKeys, "Codex advisor output contains unsupported fields"],
  [lacksAdvice, "Codex advisor output does not contain non-whitespace advice"],
];

export function parseAdvice(raw) {
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    return { error: "Codex advisor output is not valid JSON" };
  }
  const failed = ADVICE_CHECKS.find(([violates]) => violates(response));
  return failed ? { error: failed[1] } : { value: { advice: response.advice.trim() } };
}

async function readReport(outputPath) {
  try {
    const raw = await readFile(outputPath, "utf8");
    return raw.trim() ? { raw } : { error: "Codex advisor output file is empty" };
  } catch {
    return { error: "Codex advisor output file is missing or unreadable" };
  }
}

function parseReport(raw, parseResponse) {
  try {
    return { parsed: parseResponse(raw) };
  } catch (error) {
    return { error: `Codex advisor output could not be parsed (${error.message})` };
  }
}

// A parser that returns nothing is not guarded: `parse.parsed.error` throws a TypeError, and runAdvisor's
// catch reports it as a launcher-contract failure. advisor-report-stage.test.mjs pins that outcome.
export async function readAdvice(step, parseResponse) {
  const report = await readReport(step.outputPath);
  const parse = report.error ? report : parseReport(report.raw, parseResponse);
  const error = parse.error ?? parse.parsed.error;
  if (error) return { failure: stageFailure(step, "reviewer-report", error) };
  return { value: parse.parsed.value };
}

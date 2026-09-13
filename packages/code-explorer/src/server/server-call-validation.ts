import { Buffer } from "node:buffer";
import type { CodeExplorerError } from "../navigation/error.js";
import { validateResourceLimits } from "../navigation/resource-limits.js";
import {
  invalidRequest,
  limitedResource,
  unknownTool,
} from "./errors.js";
import { schemas } from "./schemas.js";
import { isToolName, type ToolName } from "./tool-name.js";

export function validateServerCall(
  name: string,
  arguments_: Record<string, unknown>,
):
  | { ok: false; error: CodeExplorerError }
  | { ok: true; name: ToolName; arguments_: Record<string, unknown> } {
  if (!isToolName(name)) return { ok: false, error: unknownTool() };
  const limit = validateResourceLimits(name, arguments_);
  if (limit) return { ok: false, error: limitedResource(limit) };
  const parsed = schemas[name].safeParse(arguments_);
  if (!parsed.success) return { ok: false, error: invalidRequest() };
  return {
    ok: true,
    name,
    arguments_: parsed.data as Record<string, unknown>,
  };
}

export function isStartSessionCall(
  name: ToolName,
  arguments_: Record<string, unknown>,
): boolean {
  return name === "code_status" && arguments_.action === "start_session";
}

export function isStateChangingCall(
  name: ToolName,
  arguments_: Record<string, unknown>,
): boolean {
  return (
    name === "code_focus" ||
    name === "code_follow" ||
    name === "code_history" ||
    (name === "code_status" && arguments_.action === "refresh")
  );
}

export function stringArgument(
  arguments_: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = arguments_[name];
  return typeof value === "string" ? value : undefined;
}

export function hasValidRequestId(value: string): boolean {
  const bytes = Buffer.byteLength(value, "utf8");
  return bytes >= 16 && bytes <= 128;
}

import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";

export function safeModeIsProven(entry: BackendAllowlistEntry): boolean {
  const options = entry.safe_initialization_options as Record<string, unknown>;
  if (entry.language === "rust") return safeRustMode(options);
  if (entry.language === "csharp")
    return options.analyzers === false && options.source_generators === false;
  return (
    options.use_project_environment === false && options.mirror_only === true
  );
}

function safeRustMode(options: Record<string, unknown>): boolean {
  const cargo = options.cargo as Record<string, unknown> | undefined;
  return (
    settingDisabled(cargo, "buildScripts") &&
    settingDisabled(cargo, "procMacro") &&
    settingDisabled(cargo, "checkOnSave") &&
    settingDisabled(options, "projectConfiguration")
  );
}

function settingDisabled(
  options: Record<string, unknown> | undefined,
  key: string,
): boolean {
  return (
    (options?.[key] as Record<string, unknown> | undefined)?.enable === false
  );
}

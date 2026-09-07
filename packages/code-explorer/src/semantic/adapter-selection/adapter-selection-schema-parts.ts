import { z } from "zod";

export const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
export const win32CommandRoot = z.enum([
  "cargo_home_bin",
  "dotnet_tools",
  "node_install",
  "npm_global",
  "code_explorer_backends",
]);
export const posixCommandRoot = z.literal("posix_code_explorer_backends");
const commandRoot = z.union([win32CommandRoot, posixCommandRoot]);
export const versionProbe = z
  .object({
    method: z.enum(["command", "package_json", "windows_file_version"]),
    command_root: commandRoot,
    executable: z.string().min(1),
    entrypoints: z.array(z.string().min(1)),
    arguments: z.array(z.string()),
    command_template: z.string().min(1),
  })
  .strict();

export const runtimeCapabilities = z
  .record(z.enum(["ready", "unavailable", "failed"]))
  .refine((value) => Object.keys(value).length > 0);

export const sentinelEvidence = z
  .object({
    fixture: z.string().min(1),
    platform: z.enum(["win32", "posix"]),
    fixture_sha256: z.string().min(1),
    side_effect_absent: z.boolean(),
    result: z.enum(["passed", "unproven", "failed"]),
    passed: z.boolean(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.passed &&
      !(evidence.result === "passed" && evidence.side_effect_absent)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "passing sentinel evidence is inconsistent",
      });
  });

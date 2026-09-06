import { z } from "zod";
import {
  runtimeCapabilities,
  sentinelEvidence,
  sha256,
  versionProbe,
  win32CommandRoot,
} from "./adapter-selection-schema-parts.js";
import { languages, relationNames } from "../contracts/contract.js";

const runtimeBackendSchema = z
  .object({
    language: z.enum(languages),
    platform_executables: z
      .object({
        posix: z.string().min(1),
        win32: z.string().min(1),
      })
      .strict(),
    platform_entrypoints: z
      .object({
        posix: z.array(z.string().min(1)),
        win32: z.array(z.string().min(1)),
      })
      .strict(),
    compatible_version: z.string().min(1),
    arguments: z.array(z.string()),
    endpoint: z.literal("stdio"),
    environment: z.record(z.string()),
    safe_initialization_options: z.record(z.unknown()),
    capabilities: z
      .object(
        Object.fromEntries(
          relationNames.map((name) => [
            name,
            z.enum(["ready", "unavailable", "failed"]),
          ]),
        ),
      )
      .strict(),
    sentinel_evidence: sentinelEvidence,
    authorization: z
      .object({
        executable_sha256: sha256,
        entrypoint_sha256s: z.array(sha256),
        package_metadata_sha256: sha256.nullable(),
        version_probe: versionProbe,
      })
      .strict(),
  })
  .strict();

export const recordSchema = z
  .object({
    schema_version: z.literal(1),
    source_dependency_versions: z
      .object({
        serena: z.string().min(1),
        "@p1va/symbols": z.string().min(1),
      })
      .strict(),
    evidence_artifact: z.literal("adapter-selection-evidence.json"),
    trusted_command_roots: z
      .object({
        posix: z.array(z.literal("posix_code_explorer_backends")).min(1),
        win32: z.array(win32CommandRoot).min(1),
      })
      .strict(),
    selected_paths: z
      .object({
        rust: z.literal("direct_standard_public_lsp"),
        python: z.literal("direct_standard_public_lsp"),
        csharp: z.literal("direct_standard_public_lsp"),
      })
      .strict(),
    runtime_backends: z.array(runtimeBackendSchema),
  })
  .strict()
  .superRefine((record, context) => {
    for (const language of languages) {
      const count = record.runtime_backends.filter(
        (backend) => backend.language === language,
      ).length;
      if (count !== 1)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `exactly one ${language} backend is required`,
        });
    }
  });

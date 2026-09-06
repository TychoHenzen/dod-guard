import { z } from "zod";
import {
  posixCommandRoot,
  sha256,
  versionProbe,
  win32CommandRoot,
} from "./adapter-selection-schema-parts.js";

const sentinelRunSchema = z
  .object({
    executable: z.string().min(1),
    executable_sha256: sha256,
    entrypoints: z.array(z.string().min(1)),
    entrypoint_sha256s: z.array(sha256),
    package_metadata_sha256: sha256.nullable(),
    backend_version: z.string().min(1),
    fixture_sha256: sha256,
    version_probe: versionProbe,
    startup: z.literal(true),
    definition_navigation: z.literal(true),
    side_effect_absent: z.literal(true),
    stderr: z.string().max(1024),
    positive_control: z
      .object({
        initialized: z.literal(true),
        definition_responded: z.literal(true),
        side_effect_absent: z.literal(false),
      })
      .strict(),
  })
  .strict();

function platformEvidenceSchema(root: z.ZodTypeAny) {
  return z
    .object({
      status: z.enum(["passed", "unproven"]),
      command_roots: z.array(root),
      commands: z.array(z.string()),
      bounded_output: z.string(),
      backend_versions: z.record(z.string(), z.string().nullable()),
      positive_controls: z.record(z.string(), z.string()),
    })
    .strict();
}

export const evidenceSchema = z
  .object({
    schema_version: z.literal(1),
    recorded_at: z.string().datetime(),
    purpose: z.string().min(1),
    platforms: z
      .object({
        win32: platformEvidenceSchema(win32CommandRoot),
        posix: platformEvidenceSchema(posixCommandRoot),
      })
      .strict(),
    fixture_tree_hashes: z
      .object({
        rust: sha256,
        python: sha256,
        csharp: sha256,
      })
      .strict(),
    sentinel_runs: z
      .object({
        rust: sentinelRunSchema,
        python: sentinelRunSchema.extend({
          package_metadata_sha256: sha256,
          environment: z
            .object({
              PATH: z.literal(""),
              PYTHONPATH: z.literal(""),
              VIRTUAL_ENV: z.literal(""),
              CONDA_PREFIX: z.literal(""),
            })
            .strict(),
        }),
        csharp: sentinelRunSchema,
      })
      .strict(),
  })
  .strict();

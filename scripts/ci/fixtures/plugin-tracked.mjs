// Fixture tree for the validate-plugins tracked-file tests. `goodTree` builds
// one package directory that satisfies every rule in plugin-checks.mjs, so a
// case that flips one predicate answer shows exactly which rule caught it.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function write(root, rel, text) {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

export const PKG_NAME = "sample-plugin";

/** A tree with one plugin package that every plugin-checks rule passes. */
export function goodTree() {
  const root = mkdtempSync(join(tmpdir(), "plugin-tracked-"));

  write(
    root,
    `packages/${PKG_NAME}/package.json`,
    JSON.stringify(
      {
        name: PKG_NAME,
        version: "1.0.0",
        main: "dist/bundle.js",
        description: "A sample plugin used only by validate-plugins.test.mjs.",
        repository: { directory: `packages/${PKG_NAME}` },
      },
      null,
      2,
    ),
  );

  write(
    root,
    `packages/${PKG_NAME}/.mcp.json`,
    JSON.stringify(
      {
        mcpServers: {
          [PKG_NAME]: {
            command: "node",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder text, not interpolation
            args: ["${CLAUDE_PLUGIN_ROOT}/dist/bundle.js"],
          },
        },
      },
      null,
      2,
    ),
  );

  write(
    root,
    `packages/${PKG_NAME}/.claude-plugin/plugin.json`,
    JSON.stringify(
      {
        name: PKG_NAME,
        version: "1.0.0",
        description: "A sample plugin used only by validate-plugins.test.mjs.",
        hooks: {
          PostToolUse: [
            {
              matcher: "*",
              hooks: [
                {
                  type: "command",
                  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder text, not interpolation
                  command: "node ${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs",
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  write(
    root,
    `packages/${PKG_NAME}/.codex-plugin/plugin.json`,
    JSON.stringify(
      {
        name: PKG_NAME,
        version: "1.0.0",
        description: "A sample plugin used only by validate-plugins.test.mjs.",
      },
      null,
      2,
    ),
  );

  write(root, `packages/${PKG_NAME}/dist/bundle.js`, "// bundle\n");
  write(root, `packages/${PKG_NAME}/scripts/hook.mjs`, "// hook\n");

  return root;
}

/**
 * The `{ name, dir, skills, agents }` shape loadPackages() builds in
 * validate-plugins.mjs, plus the two file paths the tracked-file tests break.
 */
export function buildPkg(root) {
  const dir = join(root, "packages", PKG_NAME);
  return {
    name: PKG_NAME,
    dir,
    skills: [],
    agents: [],
    bundle: join(dir, "dist", "bundle.js"),
    hookScript: join(dir, "scripts", "hook.mjs"),
  };
}

export function goodOpenCodeTree() {
  const root = mkdtempSync(join(tmpdir(), "plugin-opencode-"));
  write(
    root,
    `plugins/${PKG_NAME}/.claude-plugin/plugin.json`,
    JSON.stringify(
      {
        name: PKG_NAME,
        version: "1.0.0",
        description: "A sample plugin. Ships 1 skill and 1 agent.",
        author: { name: "tychohenzen" },
      },
      null,
      2,
    ),
  );
  write(
    root,
    `plugins/${PKG_NAME}/.codex-plugin/plugin.json`,
    JSON.stringify(
      {
        name: PKG_NAME,
        version: "1.0.0",
        description: "A sample plugin. Ships 1 skill and 1 agent.",
      },
      null,
      2,
    ),
  );
  write(
    root,
    `plugins/${PKG_NAME}/package.json`,
    JSON.stringify(
      {
        name: `@tychohenzen/${PKG_NAME}-opencode`,
        version: "1.0.0",
        description: "OpenCode adapter for the sample plugin.",
        type: "module",
        exports: { ".": "./index.js" },
        files: ["index.js", "skills", "agents"],
        dependencies: { "@opencode/plugin": "2.0.18" },
      },
      null,
      2,
    ),
  );
  write(root, `plugins/${PKG_NAME}/index.js`, "export default { id: \"sample-plugin\", setup() {} };\n");
  write(
    root,
    `plugins/${PKG_NAME}/skills/sample-skill/SKILL.md`,
    "---\nname: sample-skill\ndescription: Sample skill.\n---\n\nBody.\n",
  );
  write(
    root,
    `plugins/${PKG_NAME}/agents/sample-agent.md`,
    "---\nname: sample-agent\ndescription: Sample agent.\n---\n\nBody.\n",
  );
  return root;
}

export function buildOpenCodePlugin(root) {
  return {
    name: PKG_NAME,
    dir: join(root, "plugins", PKG_NAME),
    skills: ["sample-skill"],
    agents: ["sample-agent.md"],
  };
}

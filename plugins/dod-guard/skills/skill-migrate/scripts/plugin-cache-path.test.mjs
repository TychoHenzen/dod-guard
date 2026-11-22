import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPluginCachePath, isPluginCachePath } from "./plugin-cache-path.mjs";

describe("isPluginCachePath", () => {
  it("matches a forward-slash cache path", () => {
    assert.equal(isPluginCachePath("/home/a/.claude/plugins/cache/x/SKILL.md"), true);
  });

  it("matches a Windows backslash path in any case", () => {
    assert.equal(isPluginCachePath("C:\\Users\\a\\.Claude\\Plugins\\cache\\x\\SKILL.md"), true);
  });

  it("matches a relative path that starts at the segment", () => {
    assert.equal(isPluginCachePath(".claude/plugins/cache/x/SKILL.md"), true);
  });

  it("matches the plugins directory itself", () => {
    assert.equal(isPluginCachePath("/home/a/.claude/plugins"), true);
  });

  it("passes lookalike segments", () => {
    assert.equal(isPluginCachePath("/work/x.claude/pluginsy/SKILL.md"), false);
    assert.equal(isPluginCachePath("/work/.claude-plugins/SKILL.md"), false);
    assert.equal(isPluginCachePath("/work/.claude/plugins-src/SKILL.md"), false);
  });

  it("passes an ordinary source path", () => {
    assert.equal(isPluginCachePath("plugins/dod-guard/skills/skill-debug/SKILL.md"), false);
  });
});

describe("findPluginCachePath", () => {
  it("returns the raw path without resolving it", () => {
    const resolveReal = () => assert.fail("resolve must not run for a raw match");
    assert.equal(findPluginCachePath("/h/.claude/plugins/c/SKILL.md", resolveReal), "/h/.claude/plugins/c/SKILL.md");
  });

  it("returns the resolved path when a link points into the cache", () => {
    const resolveReal = () => "/h/.claude/plugins/cache/x/SKILL.md";
    assert.equal(findPluginCachePath("/work/link/SKILL.md", resolveReal), "/h/.claude/plugins/cache/x/SKILL.md");
  });

  it("returns null when neither form is in the cache", () => {
    assert.equal(
      findPluginCachePath("/work/SKILL.md", (p) => p),
      null,
    );
  });

  it("returns null when the path does not resolve", () => {
    const resolveReal = () => {
      throw new Error("ENOENT");
    };
    assert.equal(findPluginCachePath("/work/missing.md", resolveReal), null);
  });
});

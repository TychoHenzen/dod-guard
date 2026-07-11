// Unit tests for hello.ts — pure functions, formatters, CLI parsing.

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createGreeting,
  normalizeName,
  parseArgs,
  DEFAULT_NAME,
  DefaultFormatter,
  LoudFormatter,
  ReversedFormatter,
} from "./hello.js";

// -- createGreeting ----------------------------------------------------

describe("createGreeting", () => {
  it("returns default greeting when no options given", () => {
    assert.strictEqual(createGreeting(), `Hello, ${DEFAULT_NAME}!`);
  });

  it("greets a specific name", () => {
    assert.strictEqual(createGreeting({ name: "Tycho" }), "Hello, Tycho!");
  });

  it("uses default name when name is empty string", () => {
    assert.strictEqual(createGreeting({ name: "" }), `Hello, ${DEFAULT_NAME}!`);
  });

  it("uses LoudFormatter when provided", () => {
    const result = createGreeting({
      name: "World",
      formatter: new LoudFormatter(),
    });
    assert.strictEqual(result, "HELLO, WORLD!");
  });

  it("uses ReversedFormatter when provided", () => {
    const result = createGreeting({
      name: "World",
      formatter: new ReversedFormatter(),
    });
    assert.strictEqual(result, "!World ,olleH");
  });
});

// -- Formatters --------------------------------------------------------

describe("DefaultFormatter", () => {
  it("produces Hello, {name}! pattern", () => {
    const f = new DefaultFormatter();
    assert.strictEqual(f.format("Alice"), "Hello, Alice!");
    assert.strictEqual(f.format("Bob"), "Hello, Bob!");
  });
});

describe("LoudFormatter", () => {
  it("uppercases the name and greeting", () => {
    const f = new LoudFormatter();
    assert.strictEqual(f.format("Alice"), "HELLO, ALICE!");
  });

  it("handles already uppercase input", () => {
    const f = new LoudFormatter();
    assert.strictEqual(f.format("ALICE"), "HELLO, ALICE!");
  });
});

describe("ReversedFormatter", () => {
  it("reverses greeting pattern", () => {
    const f = new ReversedFormatter();
    assert.strictEqual(f.format("World"), "!World ,olleH");
  });
});

// -- normalizeName -----------------------------------------------------

describe("normalizeName", () => {
  it("trims leading and trailing whitespace", () => {
    assert.strictEqual(normalizeName("  Alice  "), "Alice");
  });

  it("collapses internal whitespace", () => {
    assert.strictEqual(normalizeName("Alice   Bob"), "Alice Bob");
  });

  it("returns default name for empty string", () => {
    assert.strictEqual(normalizeName(""), DEFAULT_NAME);
  });

  it("returns default name for whitespace-only string", () => {
    assert.strictEqual(normalizeName("   "), DEFAULT_NAME);
  });

  it("preserves valid name unchanged", () => {
    assert.strictEqual(normalizeName("Alice"), "Alice");
  });
});

// -- parseArgs ---------------------------------------------------------

describe("parseArgs", () => {
  it("returns defaults when no args (only node and script)", () => {
    const opts = parseArgs(["node", "hello.js"]);
    assert.strictEqual(opts.name, DEFAULT_NAME);
    assert.strictEqual(opts.formatter, undefined);
  });

  it("parses a positional name", () => {
    const opts = parseArgs(["node", "hello.js", "Tycho"]);
    assert.strictEqual(opts.name, "Tycho");
  });

  it("selects LoudFormatter with --loud flag", () => {
    const opts = parseArgs(["node", "hello.js", "--loud"]);
    assert.ok(opts.formatter instanceof LoudFormatter);
  });

  it("selects ReversedFormatter with --reversed flag", () => {
    const opts = parseArgs(["node", "hello.js", "--reversed"]);
    assert.ok(opts.formatter instanceof ReversedFormatter);
  });

  it("normalizes the positional name", () => {
    const opts = parseArgs(["node", "hello.js", "  Alice  Bob  "]);
    assert.strictEqual(opts.name, "Alice Bob");
  });

  it("name and flag together", () => {
    const opts = parseArgs(["node", "hello.js", "Tycho", "--loud"]);
    assert.strictEqual(opts.name, "Tycho");
    assert.ok(opts.formatter instanceof LoudFormatter);
  });

  it("falls back to default name when no positional arg", () => {
    const opts = parseArgs(["node", "hello.js", "--loud"]);
    assert.strictEqual(opts.name, DEFAULT_NAME);
  });
});

// -- Integration -------------------------------------------------------

describe("createGreeting + normalizeName integration", () => {
  it("composes to produce clean greetings from raw input", () => {
    const raw = "   Siriu   ";
    const name = normalizeName(raw);
    const greeting = createGreeting({ name });
    assert.strictEqual(greeting, "Hello, Siriu!");
  });
});

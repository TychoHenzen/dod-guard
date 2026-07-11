/**
 * hello — Greeting module.
 *
 * Modular design: pure functions for composition, an interface for
 * pluggable formatters, and a CLI entry point. Every function is
 * independently testable.
 */

// ── Types ──────────────────────────────────────────────────────────

/** Format a greeting from a name. */
export interface GreetingFormatter {
  format(name: string): string;
}

/** Options for {@link createGreeting}. */
export interface GreetingOptions {
  /** Name to greet. Defaults to "World". */
  name?: string;
  /** Formatter that shapes the greeting string. */
  formatter?: GreetingFormatter;
}

// ── Formatters ─────────────────────────────────────────────────────

/** Default formatter: "Hello, {name}!". */
export class DefaultFormatter implements GreetingFormatter {
  format(name: string): string {
    return `Hello, ${name}!`;
  }
}

/** Uppercase formatter: "HELLO, {NAME}!". */
export class LoudFormatter implements GreetingFormatter {
  format(name: string): string {
    return `HELLO, ${name.toUpperCase()}!`;
  }
}

/** Reversed formatter: "!{name} ,olleH". */
export class ReversedFormatter implements GreetingFormatter {
  format(name: string): string {
    return `!${name} ,olleH`;
  }
}

// ── Core ───────────────────────────────────────────────────────────

/** Default name used when none is provided. */
export const DEFAULT_NAME = "World";

/**
 * Create a greeting string.
 *
 * Pure function — no side effects. Composes name + formatter.
 */
export function createGreeting(options: GreetingOptions = {}): string {
  // Defensive: normalizeName handles empty string → DEFAULT_NAME
  const name = normalizeName(options.name ?? "");
  const formatter = options.formatter ?? new DefaultFormatter();
  return formatter.format(name);
}

/**
 * Normalize a name string: trim whitespace, collapse internal spaces.
 * Returns the default name when the input is empty after trimming.
 */
export function normalizeName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return DEFAULT_NAME;
  return trimmed.replace(/\s+/g, " ");
}

// ── CLI ────────────────────────────────────────────────────────────

/**
 * Parse CLI arguments into {@link GreetingOptions}.
 *
 * Usage: `node hello.js [name] [--loud|--reversed]`
 */
export function parseArgs(argv: string[]): GreetingOptions {
  const args = argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));

  let formatter: GreetingFormatter | undefined;
  if (flags.has("--loud")) formatter = new LoudFormatter();
  else if (flags.has("--reversed")) formatter = new ReversedFormatter();

  const name = positional.length > 0 ? normalizeName(positional[0]) : DEFAULT_NAME;

  return { name, formatter };
}

/**
 * Print greeting to stdout. CLI entry point.
 */
export function main(argv: string[] = process.argv): void {
  const options = parseArgs(argv);
  process.stdout.write(`${createGreeting(options)}\n`);
}

// Allow direct execution: `node dist/hello.js`
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main();
}

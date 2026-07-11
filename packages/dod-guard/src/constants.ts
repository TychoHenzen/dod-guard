/**
 * Shared constants referenced across modules.
 *
 * Avoids circular imports: checker.ts and observability.ts both use these
 * but sit on opposite sides of the checker → evaluate-proof → observability
 * dependency chain.
 */

/** Max chars of a command logged in error/debug output before truncation. */
export const CMD_TRUNCATION = 80;

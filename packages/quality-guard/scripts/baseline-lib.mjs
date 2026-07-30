/**
 * The one place the hook reaches into the skill for baseline handling.
 *
 * Keeping the re-export here means the path appears once, so the hook and the
 * CI ratchet cannot drift onto different implementations of the same format.
 */

export { compareToBaseline, readBaseline, writeBaseline } from "../skills/quality-refactor/scripts/lib/baseline.mjs";

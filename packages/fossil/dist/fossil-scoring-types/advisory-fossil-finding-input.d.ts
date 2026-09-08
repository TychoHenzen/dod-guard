import type { FossilFinding } from "../types.js";
/** Required finding evidence excluding its fixed classification. */
export type AdvisoryFossilFindingInput = Omit<FossilFinding, "classification">;

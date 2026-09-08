import type { FossilFinding } from "../types.js";

/** Required fossil-finding evidence excluding its fixed advisory classification. */
export type AdvisoryFossilFindingInput = Omit<FossilFinding, "classification">;

/**
 * dod_refine — Refine a draft TaskNode into concrete or subdivide into children.
 */
import type { Predicate, ProofCategory } from "../types.js";
interface RefineParams {
    dod_id: string;
    node_path: string;
    mode: "concretize" | "subdivide";
    command?: string;
    predicate?: Predicate;
    description?: string;
    category?: ProofCategory;
    advisory?: boolean;
    children?: {
        title: string;
        intent: string;
    }[];
}
export declare function handleDodRefine(params: RefineParams): Promise<string>;
export {};

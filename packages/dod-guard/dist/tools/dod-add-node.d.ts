/**
 * dod_add_node — Add a new TaskNode (draft or concrete) to a DoD tree.
 */
import type { Predicate, ProofCategory } from "../types.js";
interface AddNodeParams {
    dod_id: string;
    parent_path: string;
    parent_id?: string;
    title: string;
    refinement: "draft" | "concrete";
    intent?: string;
    command?: string;
    predicate?: Predicate;
    description?: string;
    category?: ProofCategory;
    advisory?: boolean;
}
export declare function handleDodAddNode(params: AddNodeParams): Promise<{
    path: string;
    message: string;
}>;
export {};

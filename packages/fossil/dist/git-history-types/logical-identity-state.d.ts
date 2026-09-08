import type { FileEvent } from "./file-event.js";
export interface LogicalIdentityState {
    readonly identity: string;
    readonly paths: string[];
    readonly events: FileEvent[];
    currentPath?: string;
}

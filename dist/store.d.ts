import type { DodDocument } from "./types.js";
export declare function generateId(): string;
export declare function save(doc: DodDocument): Promise<void>;
export declare function load(id: string): Promise<DodDocument | null>;
export declare function findByPath(markdownPath: string): Promise<DodDocument | null>;
export declare function listAll(): Promise<DodDocument[]>;
export declare function remove(id: string): Promise<boolean>;

import type { DodSections } from "../types.js";
interface CreateParams {
    title: string;
    goal: string;
    type: "bug" | "general" | "minimal";
    cwd: string;
    markdown_path: string;
    sections: DodSections;
    roots: any[];
    skip_reasons?: Record<string, string>;
}
export declare function handleDodCreate(params: CreateParams): Promise<string>;
export {};

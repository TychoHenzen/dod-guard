import type { DodSections, Step } from "./types.js";
interface ParsedDod {
    title: string;
    goal: string;
    date: string;
    cwd: string;
    sections: DodSections;
    steps: Step[];
}
export declare function parseMarkdown(filePath: string): Promise<ParsedDod>;
export {};

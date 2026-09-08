export interface GitFileChange {
    readonly status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type-changed" | "unmerged" | "unknown";
    readonly path: string;
    readonly previousPath?: string;
}

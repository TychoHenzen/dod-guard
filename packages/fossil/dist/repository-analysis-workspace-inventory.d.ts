export declare function buildWorkspaceInventory(input: {
    trackedOutput: string;
    workspaceCandidates: readonly {
        readonly path: string;
    }[];
}): string[];
export declare function assertWorkspaceInventoryLimit(inventory: readonly string[]): void;

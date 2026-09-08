export interface WorkspaceFileMetadata {
    readonly path: string;
    readonly isRegularFile: boolean;
    /** No-follow metadata indicates this path is a symbolic link. */
    readonly isSymbolicLink?: boolean;
    /** No-follow metadata indicates this path is a Windows junction. */
    readonly isJunction?: boolean;
    readonly modifiedTimestampMs: number;
}

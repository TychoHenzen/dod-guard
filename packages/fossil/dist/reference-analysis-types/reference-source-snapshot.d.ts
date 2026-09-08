export interface ReferenceSourceSnapshot {
    readonly identity: string;
    readonly isRegularFile: boolean;
    readonly byteLength: number;
    readonly canonicalPath: string;
}

export interface BurstFileActivity {
    readonly identity: string;
    readonly path: string;
    readonly burstCommits: number;
    readonly postBurstCommits: number;
    readonly createdInBurst: boolean;
    readonly existsAtHead: boolean;
}

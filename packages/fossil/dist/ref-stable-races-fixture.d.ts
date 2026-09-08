export declare function runStableRaceScenario(): {
    result: import("./ref-analyzer.js").BoundedReferenceReadResult;
    sources: readonly [{
        readonly path: "src/stable.ts";
        readonly language: "typescript";
    }, {
        readonly path: "src/disappeared.ts";
        readonly language: "typescript";
    }, {
        readonly path: "src/type.ts";
        readonly language: "typescript";
    }, {
        readonly path: "src/identity.ts";
        readonly language: "typescript";
    }, {
        readonly path: "src/canonical.ts";
        readonly language: "typescript";
    }, {
        readonly path: "src/size.ts";
        readonly language: "typescript";
    }, {
        readonly path: "src/binary.ts";
        readonly language: "typescript";
    }, {
        readonly path: "src/read-failure.ts";
        readonly language: "typescript";
    }];
    inspectionReads: string[];
    contentReads: string[];
};

import { createReport, optionsFor } from "./testing/report-fixtures.js";
export { optionsFor } from "./testing/report-fixtures.js";
export const validDirectOptions = optionsFor("json");
export const invalidDirectOptionShapes = [
    { days: 0 },
    { gapHours: 8_761 },
    { threshold: Number.NaN },
    { untrackedAgeDays: 3_651 },
    { format: "yaml" },
    { extensions: Array.from({ length: 65 }, () => "ts") },
    { extensions: [""] },
    { extensions: [42] },
    { extensions: "ts" },
    { exclude: [42] },
    { exclude: "generated/**" },
    { verbose: "true" },
];
export function reportFor(options) {
    return createReport(options);
}
//# sourceMappingURL=index.test-support.js.map
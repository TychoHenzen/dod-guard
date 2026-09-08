import { addReferenceWarning } from "./reference-read-support.js";
export function warnStableRead(input, code, message) {
    addReferenceWarning({
        ...input.collections,
        source: input.source,
        code,
        message,
    });
}
//# sourceMappingURL=reference-read-stable-warn.js.map
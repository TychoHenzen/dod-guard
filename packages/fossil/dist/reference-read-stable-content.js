import { addBinaryReferenceWarning, addReferenceWarning } from "./reference-read-support.js";
export function readStableContent(input, initial) {
    try {
        const content = input.boundary.read(input.source);
        if (content.includes("\0")) {
            addBinaryReferenceWarning({ ...input.collections, source: input.source });
            return;
        }
        input.collections.readableSources.push({ ...input.source, content });
        input.budget.acceptedBytes += initial.byteLength;
    }
    catch {
        addReferenceWarning({
            ...input.collections,
            source: input.source,
            code: "reference_unreadable",
            message: "Reference source could not be read.",
        });
    }
}
//# sourceMappingURL=reference-read-stable-content.js.map
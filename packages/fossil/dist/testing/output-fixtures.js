/** Captures output through injected writers. */
export function createOutputCapture() {
    const stdout = [];
    const stderr = [];
    return {
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
        stdout: () => stdout.join(""),
        stderr: () => stderr.join(""),
    };
}
//# sourceMappingURL=output-fixtures.js.map
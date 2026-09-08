/** Provides a mutable copy-on-read clock for deterministic tests. */
export function createDeterministicClock(initialTime) {
    let currentTime = new Date(initialTime).getTime();
    return {
        now: () => new Date(currentTime),
        set: (time) => {
            currentTime = new Date(time).getTime();
        },
        advance: (milliseconds) => {
            currentTime += milliseconds;
        },
    };
}
//# sourceMappingURL=clock-fixtures.js.map
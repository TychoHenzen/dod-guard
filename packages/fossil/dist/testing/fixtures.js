import { afterEach } from "node:test";
import { createTemporaryRepository, writeSourceTree, } from "./repository-fixtures.js";
const repositories = [];
afterEach(async () => {
    await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()));
});
export { createDeterministicClock } from "./clock-fixtures.js";
export { createOutputCapture } from "./output-fixtures.js";
export async function temporaryRepository() {
    const repository = await createTemporaryRepository();
    repositories.push(repository);
    return repository;
}
export { createTemporaryRepository, writeSourceTree };
//# sourceMappingURL=fixtures.js.map
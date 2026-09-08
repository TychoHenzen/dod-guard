export {
  FakeBackendLog,
  removeTemporaryTree,
  waitForFakeConfiguration,
  writeFakeLspServer,
} from "./index-test-fake-backend.js";
import * as standaloneRecord from "./index-test-standalone-record.js";
import { roslynStorePath } from "./index-test-standalone-authorization.js";

export const createStandaloneBackendRecord =
  standaloneRecord.createStandaloneBackendRecord;
export { roslynStorePath };

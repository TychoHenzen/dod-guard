import type { PythonMirrorApi } from "./python-mirror-runtime-types.js";

export type ActiveMirror = {
  mirror: PythonMirrorApi["mirror"];
  fingerprint: string;
};

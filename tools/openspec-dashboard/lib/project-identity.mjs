// project-identity.mjs - canonical roots and filesystem identities for managed project processes.

import { realpathSync, statSync } from "node:fs";

const systemFs = {
  realpath: realpathSync,
  stat: (path) => statSync(path, { bigint: true }),
};

/** Use the portable Node device/inode pair after resolving links and case aliases. */
export function createProjectIdentity({ fs = systemFs } = {}) {
  function canonicalPath(projectPath) {
    return fs.realpath(projectPath);
  }

  function identity(projectPath) {
    const metadata = fs.stat(projectPath);
    return `${String(metadata.dev)}:${String(metadata.ino)}`;
  }

  return { canonicalPath, identity };
}

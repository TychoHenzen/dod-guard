import { bundlePackage } from "../../scripts/build/bundle.mjs";

await bundlePackage({ external: ["better-sqlite3"], requireShim: true, shebang: false });

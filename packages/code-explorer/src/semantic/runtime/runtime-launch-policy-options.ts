import type * as launchOptions from "../backend-launch/types.js";

export type RuntimeLaunchPolicyOptions = Pick<
  launchOptions.BackendLaunchPolicyOptions,
  "project_root" | "platform" | "inspect"
>;

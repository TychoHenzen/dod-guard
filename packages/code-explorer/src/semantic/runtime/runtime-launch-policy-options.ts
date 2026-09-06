import type * as launchOptions from "../backend-launch/backend-launch-policy-options.js";

export type RuntimeLaunchPolicyOptions = Pick<
  launchOptions.BackendLaunchPolicyOptions,
  "project_root" | "platform" | "inspect"
>;

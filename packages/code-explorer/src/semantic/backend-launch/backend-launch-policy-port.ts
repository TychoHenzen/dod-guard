import type { Language } from "../contracts/contract.js";
import type * as confirmation from "./backend-launch-confirmation.js";
import type * as preparation from "./backend-launch-preparation.js";

export type BackendLaunchPolicy = {
  prepare(
    language: Language,
    projectConfiguration?: unknown,
  ): preparation.BackendLaunchPreparation;
  confirmInitialized(
    language: Language,
  ): confirmation.BackendLaunchConfirmation;
};

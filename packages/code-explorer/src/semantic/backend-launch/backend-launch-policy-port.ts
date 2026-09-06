import type { BackendLaunchPreparation } from "./backend-launch-preparation.js";
import type { Language } from "../contracts/contract.js";
import type {
  BackendLaunchConfirmation,
} from "./backend-launch-confirmation.js";

export type {
  BackendLaunchConfirmation,
} from "./backend-launch-confirmation.js";

export type BackendLaunchPolicy = {
  prepare(
    language: Language,
    projectConfiguration?: unknown,
  ): BackendLaunchPreparation;
  confirmInitialized(language: Language): BackendLaunchConfirmation;
};

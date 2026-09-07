import type { CodeExplorerErrorCode } from "./error-code.js";
import type { ErrorDetails } from "./error-details.js";

export type CodeExplorerError = {
  schema_version: 1;
  code: CodeExplorerErrorCode;
  message: CodeExplorerErrorCode;
  retryable: boolean;
  details?: ErrorDetails;
};

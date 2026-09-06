import * as semanticBackend from "./direct-lsp-semantic-backend.js";
import * as semanticCapabilities from "./direct-lsp-semantic-capabilities.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";

const { createDirectLspSemanticBackend } = semanticBackend;
const { relationCapabilitiesFromInitialize } = semanticCapabilities;

export type { ReadOnlyLspClient } from "./direct-lsp-semantic-client.js";
export { createDirectLspSemanticBackend, relationCapabilitiesFromInitialize };
export type DirectLspSemanticOptions = semanticOptions.DirectLspSemanticOptions;

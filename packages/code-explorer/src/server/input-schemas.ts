export const inputSchemas = {
  code_search: {
    type: "object",
    properties: {
      query: { type: "string" },
      path_globs: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      kinds: { type: "array", items: { type: "string" } },
      content: { enum: ["all", "production", "tests"] },
      include_generated: { type: "boolean" },
      limit: { type: "integer" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  code_focus: {
    type: "object",
    properties: {
      session_id: { type: "string" },
      request_id: { type: "string" },
      symbol_id: { type: "string" },
      body_limit_bytes: { type: "integer" },
    },
    required: ["session_id", "request_id", "symbol_id"],
    additionalProperties: false,
  },
  code_follow: {
    type: "object",
    properties: {
      session_id: { type: "string" },
      request_id: { type: "string" },
      view_id: { type: "string" },
      handle: { type: "string" },
      relation: { enum: ["definition", "references", "callers", "callees", "type", "implementation"] },
      limit: { type: "integer" },
    },
    required: ["session_id", "request_id", "view_id", "handle", "relation"],
    additionalProperties: false,
  },
  code_history: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: {
          session_id: { type: "string" },
          request_id: { type: "string" },
          action: { enum: ["back", "forward"] },
        },
        required: ["session_id", "request_id", "action"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          session_id: { type: "string" },
          request_id: { type: "string" },
          action: { const: "recent" },
          limit: { type: "integer" },
        },
        required: ["session_id", "request_id", "action"],
        additionalProperties: false,
      },
    ],
  },
  code_status: {
    type: "object",
    oneOf: [
      {
        type: "object",
        properties: { action: { const: "status" } },
        required: ["action"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: { action: { const: "start_session" } },
        required: ["action"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: { action: { const: "refresh" }, session_id: { type: "string" }, request_id: { type: "string" } },
        required: ["action", "session_id", "request_id"],
        additionalProperties: false,
      },
    ],
  },
} as const;

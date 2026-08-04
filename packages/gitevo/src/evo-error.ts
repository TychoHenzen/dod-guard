/**
 * The one error type gitevo raises for a refusal the caller can act on.
 *
 * The MCP server turns it into "ERROR: <message>" and evomcp checks it with
 * instanceof across a package boundary, so it must stay a real Error subclass.
 */
export class EvoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvoError";
  }
}

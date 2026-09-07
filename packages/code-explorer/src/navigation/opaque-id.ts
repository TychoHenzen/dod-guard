import { randomBytes } from "node:crypto";

/** Opaque identifiers carry 128 bits of cryptographically random data. */
export function mintOpaqueId(): string {
  return randomBytes(16).toString("base64url");
}

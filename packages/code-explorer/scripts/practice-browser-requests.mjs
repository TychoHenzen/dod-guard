import { randomUUID } from "node:crypto";
import { call, expectSuccess } from "./practice-browser-transport.mjs";

export function requestBody(body) {
  return { request_id: randomUUID(), ...body };
}

export function request(context, route, body) {
  return call({ ...context, route, body });
}

export async function successfulRequest({ context, route, body, operation }) {
  return expectSuccess(await request(context, route, body), operation);
}

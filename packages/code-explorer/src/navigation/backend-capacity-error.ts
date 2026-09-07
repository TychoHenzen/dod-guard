export class BackendCapacityError extends Error {
  constructor() {
    super("resource_limit");
  }
}

export interface ReferenceContainmentBoundary {
  readonly canonicalRepositoryRoot: string;
  readonly canonicalize: (path: string) => string;
}

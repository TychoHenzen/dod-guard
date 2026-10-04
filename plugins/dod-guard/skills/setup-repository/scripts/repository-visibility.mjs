const PUBLIC_VISIBILITY = "public";
const HTTP_STATUS_MIN = 100;
const HTTP_STATUS_MAX = 599;

function requireText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function targetIdentity({ owner, name }) {
  return `${requireText(owner, "owner")}/${requireText(name, "name")}`;
}

function sameIdentity(left, right) {
  return typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
}

function providerEvidence(error) {
  const evidence = {};
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (Number.isInteger(status) && status >= HTTP_STATUS_MIN && status <= HTTP_STATUS_MAX) {
    evidence.status = status;
  }
  for (const key of ["category", "code"]) {
    if (typeof error?.[key] === "string" && error[key].length > 0) {
      evidence[key] = error[key];
    }
  }
  return evidence;
}

function stop({ stage, target, mutationAttempted, providerError, readback }) {
  const error = new Error(`Repository visibility setup stopped during ${stage} for ${target}.`);
  error.name = "RepositoryVisibilityStopError";
  error.details = {
    stage,
    target,
    mutationAttempted,
  };
  if (providerError) error.details.provider = providerEvidence(providerError);
  if (readback) error.details.readback = providerEvidence(readback);
  return error;
}

export function buildPublicRepositoryPayload({ name, organization, description }) {
  const payload = {
    name: requireText(name, "name"),
    private: false,
    autoInit: false,
  };
  if (organization !== undefined) {
    payload.organization = requireText(organization, "organization");
  }
  if (description !== undefined) {
    payload.description = requireText(description, "description");
  }
  return payload;
}

export function assertPublicRepositoryReadback(repository, { owner, name }) {
  const target = targetIdentity({ owner, name });
  if (!repository || typeof repository !== "object" || Array.isArray(repository)) {
    throw stop({ stage: "repository readback", target, mutationAttempted: true });
  }

  const observedIdentity = repository.full_name ?? repository.nameWithOwner;
  if (!sameIdentity(observedIdentity, target)) {
    throw stop({ stage: "repository readback", target, mutationAttempted: true });
  }
  if (repository.private !== false || repository.visibility !== PUBLIC_VISIBILITY) {
    throw stop({ stage: "repository readback", target, mutationAttempted: true });
  }
  return repository;
}

export async function createPublicRepository({
  owner,
  name,
  organization,
  description,
  readRepository,
  createRepository,
  mutationLedger = [],
}) {
  const target = targetIdentity({ owner, name });
  const resolvedOwner = requireText(owner, "owner");
  const resolvedName = requireText(name, "name");
  const resolvedOrganization = organization === undefined ? undefined : requireText(organization, "organization");
  if (resolvedOrganization !== undefined && !sameIdentity(resolvedOrganization, resolvedOwner)) {
    throw stop({ stage: "destination validation", target, mutationAttempted: false });
  }
  if (typeof readRepository !== "function") {
    throw new TypeError("readRepository must be a function.");
  }
  if (typeof createRepository !== "function") {
    throw new TypeError("createRepository must be a function.");
  }
  if (!Array.isArray(mutationLedger)) {
    throw new TypeError("mutationLedger must be an array.");
  }

  let existing;
  try {
    existing = await readRepository({ owner: resolvedOwner, name: resolvedName });
  } catch (error) {
    throw stop({ stage: "pre-create read", target, mutationAttempted: false, providerError: error });
  }
  if (existing === undefined) {
    throw stop({ stage: "pre-create read", target, mutationAttempted: false });
  }
  if (existing !== null) {
    throw stop({ stage: "pre-create read", target, mutationAttempted: false, readback: existing });
  }

  const payload = buildPublicRepositoryPayload({
    name: resolvedName,
    organization: resolvedOrganization === undefined ? undefined : resolvedOwner,
    description,
  });
  const ledgerEntry = {
    operation: "create_repository",
    target,
    requestedVisibility: PUBLIC_VISIBILITY,
    status: "attempted",
  };
  mutationLedger.push(ledgerEntry);

  let createError;
  try {
    await createRepository(payload);
  } catch (error) {
    createError = error;
  }

  let readback;
  try {
    readback = await readRepository({ owner: resolvedOwner, name: resolvedName });
  } catch (error) {
    throw stop({
      stage: "post-create readback",
      target,
      mutationAttempted: true,
      providerError: createError ?? error,
      readback: error,
    });
  }
  if (readback === undefined || readback === null) {
    throw stop({ stage: "post-create readback", target, mutationAttempted: true, providerError: createError });
  }

  let verified;
  try {
    verified = assertPublicRepositoryReadback(readback, { owner: resolvedOwner, name: resolvedName });
  } catch (error) {
    throw stop({
      stage: "post-create readback",
      target,
      mutationAttempted: true,
      providerError: createError,
      readback: error,
    });
  }
  ledgerEntry.status = "verified";
  return { payload, repository: verified, mutationLedger };
}

export { PUBLIC_VISIBILITY };

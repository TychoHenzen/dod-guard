function shouldRetryDefinition(language, operation, result) {
  return language === "rust" && operation === "definition" && result.relations?.length === 0;
}

async function queryObservation(backend, language, operation, source) {
  let result = await backend.query({ operation, symbol_id: source.id });
  if (!shouldRetryDefinition(language, operation, result)) return result;
  for (let retry = 0; retry < 4; retry += 1) {
    if (result.relations?.length !== 0) break;
    await new Promise((resolve_) => setTimeout(resolve_, 1_000));
    result = await backend.query({ operation, symbol_id: source.id });
  }
  return result;
}

function recordObservation(observations, name, result) {
  const relations = result.relations ?? [];
  observations[name] = { status: "returned", relation_count: relations.length, local_count: relations.filter((relation) => relation.symbol).length, external_count: relations.filter((relation) => relation.external).length };
}

async function observe(observations, backend, language, name, operation, source) {
  try {
    recordObservation(observations, name, await queryObservation(backend, language, operation, source));
  } catch (error) {
    observations[name] = { status: "unavailable", code: error instanceof Error ? error.message : String(error) };
  }
}

export async function collectObservations(backend, language, sources) {
  const observations = {};
  await observe(observations, backend, language, "definition", "definition", sources.helperCall);
  if (language === "rust") await new Promise((resolve_) => setTimeout(resolve_, 2_000));
  await observe(observations, backend, language, "references", "references", sources.helperDefinition);
  await observe(observations, backend, language, "callers", "callers", sources.helperDefinition);
  await observe(observations, backend, language, "callees", "callees", sources.callerDefinition);
  await observe(observations, backend, language, "external_definition", "definition", sources.externalCall);
  await observe(observations, backend, language, "implementation", "implementation", sources.helperDefinition);
  await observe(observations, backend, language, "unavailable_relation", "implementation", { id: `${language}:missing-handle` });
  return observations;
}

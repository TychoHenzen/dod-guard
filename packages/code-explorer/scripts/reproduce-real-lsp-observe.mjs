export async function collectObservations(backend, language, sources) {
  const observations = {};
  async function observe(name, operation, source) {
    try {
      let result = await backend.query({ operation, symbol_id: source.id });
      if (language === "rust" && operation === "definition" && result.relations?.length === 0)
        for (let retry = 0; retry < 4 && result.relations.length === 0; retry += 1) {
          await new Promise((resolve_) => setTimeout(resolve_, 1_000));
          result = await backend.query({ operation, symbol_id: source.id });
        }
      observations[name] = { status: "returned", relation_count: result.relations?.length ?? 0, local_count: result.relations?.filter((relation) => relation.symbol).length ?? 0, external_count: result.relations?.filter((relation) => relation.external).length ?? 0 };
    } catch (error) {
      observations[name] = { status: "unavailable", code: error instanceof Error ? error.message : String(error) };
    }
  }
  await observe("definition", "definition", sources.helperCall);
  if (language === "rust") await new Promise((resolve_) => setTimeout(resolve_, 2_000));
  await observe("references", "references", sources.helperDefinition);
  await observe("callers", "callers", sources.helperDefinition);
  await observe("callees", "callees", sources.callerDefinition);
  await observe("external_definition", "definition", sources.externalCall);
  await observe("implementation", "implementation", sources.helperDefinition);
  await observe("unavailable_relation", "implementation", { id: `${language}:missing-handle` });
  return observations;
}

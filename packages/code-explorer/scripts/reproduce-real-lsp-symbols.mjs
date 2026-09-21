function sourceRange(position, name) {
  const end = {
    line: position.line,
    character: position.character + name.length,
  };
  return { start: position, end };
}

function symbol(language, fixture, { id, name, position }) {
  const location = { path: fixture.path, range: sourceRange(position, name) };
  return {
    id: `${language}:${id}`,
    name,
    language,
    kind: "function",
    location,
  };
}

function createHelperSources(language, fixture) {
  return {
    helperDefinition: symbol(
      language,
      fixture,
      {
        id: "helper-definition",
        name: "helper",
        position: fixture.positions.helperDefinition,
      },
    ),
    helperCall: symbol(
      language,
      fixture,
      {
        id: "helper-call",
        name: "helper",
        position: fixture.positions.helperCall,
      },
    ),
  };
}

function createCallerSources(language, fixture, externalName) {
  return {
    callerDefinition: symbol(
      language,
      fixture,
      {
        id: "caller-definition",
        name: "caller",
        position: fixture.positions.callerDefinition,
      },
    ),
    externalCall: symbol(
      language,
      fixture,
      {
        id: "external-call",
        name: externalName,
        position: fixture.positions.externalCall,
      },
    ),
  };
}

export function createSources({ language, fixture }) {
  const externalName =
    language === "csharp"
      ? "Console"
      : language === "python"
        ? "print"
        : "drop";
  return {
    ...createHelperSources(language, fixture),
    ...createCallerSources(language, fixture, externalName),
  };
}

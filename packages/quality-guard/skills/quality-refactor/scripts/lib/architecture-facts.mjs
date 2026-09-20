import { importsFor } from "./architecture-imports.mjs";
import { languageFor, unique } from "./architecture-language.mjs";
import { declaredTypes } from "./architecture-types.mjs";
import { typeFacts } from "./architecture-members.mjs";
import { designFacts } from "./design-smells/design-facts.mjs";

function referencesFor(source, types, imports) {
  const names = [...source.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)].map(
    (match) => match[0],
  );
  const importedNames = imports
    .flatMap((item) => item.split(/[./:]/))
    .filter((item) => /^[A-Z]/.test(item));
  return unique(
    [...names, ...importedNames].filter(
      (name) => !types.some((type) => type.name === name),
    ),
  );
}

function emptyFacts(path) {
  return {
    facts: {
      path,
      language: null,
      imports: [],
      references: [],
      types: [],
      configurationDefaults: [],
      transitiveNavigation: [],
    },
    errors: [],
  };
}

function factsFor(file, { lang, types, imports }) {
  return {
    facts: {
      path: file.path,
      language: lang,
      imports,
      references: referencesFor(file.content, types, imports),
      types,
      ...designFacts(file.content, lang),
    },
    errors: [],
  };
}

export function extractArchitectureFacts(file) {
  const lang = languageFor(file.path);
  if (!lang) return emptyFacts(file.path);
  const declared = declaredTypes(file.content, lang);
  if (declared.error) return { facts: null, errors: [declared.error] };
  const types = declared.types
    .map((type) => typeFacts(type, lang))
    .sort((left, right) => left.name.localeCompare(right.name));
  const imports = importsFor(file.content, lang);
  return factsFor(file, { lang, types, imports });
}

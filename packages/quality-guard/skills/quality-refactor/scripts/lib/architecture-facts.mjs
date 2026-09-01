// Architecture facts are deliberately small, deterministic evidence. They
// reuse the scanner's language families but do not attempt semantic parsing.
// A changed supported file that has an unclosed structural body is an error:
// returning empty facts there would make a broken analysis look clean.

import { extname } from "node:path";
import { matchBracket } from "./offsets.mjs";

const LANGUAGE_BY_EXTENSION = {
  ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts", ".js": "ts", ".jsx": "ts", ".mjs": "ts", ".cjs": "ts",
  ".cs": "cs", ".java": "java", ".kt": "java", ".rs": "rs", ".py": "py", ".go": "go", ".c": "cpp", ".h": "cpp", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
};

const TYPE_PATTERNS = {
  ts: /\b(?:export\s+)?(?:abstract\s+)?(class|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  cs: /\b(?:public\s+|internal\s+|private\s+|protected\s+)?(class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/g,
  java: /\b(?:public\s+|internal\s+|private\s+|protected\s+)?(class|interface|enum|record)\s+([A-Za-z_]\w*)/g,
  rs: /\b(?:pub\s+)?(struct|enum|trait|union)\s+([A-Za-z_]\w*)/g,
  go: /\btype\s+([A-Za-z_]\w*)\s+(struct|interface)\b/g,
  cpp: /\b(class|struct|enum)\s+([A-Za-z_]\w*)/g,
};

function unique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function visibility(prefix, lang, name) {
  if (/\b(?:public|pub)\b/.test(prefix)) return "public";
  if (/\b(?:private)\b/.test(prefix) || name.startsWith("#")) return "private";
  if (/\bprotected\b/.test(prefix)) return "protected";
  if (lang === "ts" || lang === "go") return "public";
  return "internal";
}

function importsFor(source, lang) {
  const patterns = {
    ts: /\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/g,
    cs: /^\s*using\s+([\w.]+)/gm,
    java: /^\s*import\s+([\w.*]+)/gm,
    rs: /^\s*use\s+([^;\n]+)/gm,
    py: /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm,
    go: /^\s*import\s+(?:\([^)]*?\)|"([^"]+)")/gms,
    cpp: /^\s*#include\s+[<"]([^>"]+)[>"]/gm,
  };
  const pattern = patterns[lang];
  if (!pattern) return [];
  const found = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (lang === "go" && match[0].includes("(")) {
      found.push(...[...match[0].matchAll(/"([^"]+)"/g)].map((item) => item[1]));
    } else found.push(match[1] ?? match[2]);
  }
  return unique(found.filter(Boolean));
}

function braceBody(source, offset) {
  const open = source.indexOf("{", offset);
  if (open === -1) return null;
  const close = matchBracket(source, open, "{}");
  if (close === -1) return null;
  return { start: open + 1, end: close, text: source.slice(open + 1, close) };
}

function blankComments(source) {
  return source.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\r\n]/g, " "));
}

function pythonTypes(source) {
  const lines = source.split("\n");
  const result = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)class\s+([A-Za-z_]\w*)/.exec(lines[index]);
    if (!match) {
      offset += lines[index].length + 1;
      continue;
    }
    const indent = match[1].replace(/\t/g, "    ").length;
    let end = index + 1;
    while (end < lines.length && (lines[end].trim() === "" || /^[ \t]*/.exec(lines[end])[0].replace(/\t/g, "    ").length > indent)) end += 1;
    const bodyStart = offset + lines[index].length + 1;
    const bodyEnd = bodyStart + lines.slice(index + 1, end).join("\n").length;
    result.push({ kind: "class", name: match[2], start: offset, body: { start: bodyStart, end: bodyEnd, text: source.slice(bodyStart, bodyEnd) } });
    offset += lines[index].length + 1;
  }
  return result;
}

function declaredTypes(source, lang) {
  if (lang === "py") return { types: pythonTypes(source) };
  const pattern = TYPE_PATTERNS[lang];
  const searchable = blankComments(source);
  const types = [];
  let match;
  while ((match = pattern.exec(searchable)) !== null) {
    const name = lang === "go" ? match[1] : match[2];
    const kind = lang === "go" ? match[2] : match[1];
    const body = braceBody(source, match.index + match[0].length);
    if (!body) return { types: [], error: `cannot extract required architecture facts: ${name} has no closed body` };
    types.push({ kind, name, start: match.index, body });
  }
  return { types };
}

function methodMembers(body, lang) {
  const patterns = {
    ts: /(^|[;{}\n])\s*((?:(?:public|private|protected|static|async|readonly)\s+)*)?([#A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*[{=>]/g,
    cs: /(^|[;{}\n])\s*((?:(?:public|private|protected|internal|static|async|virtual|override)\s+)*)?\w[\w<>?,.\[\]]*\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*{/g,
    java: /(^|[;{}\n])\s*((?:(?:public|private|protected|internal|static|suspend|open|override)\s+)*)?[\w<>?,.\[\]]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*{/g,
    rs: /\b((?:pub\s+)?(?:async\s+)?(?:unsafe\s+)?)fn\s+([A-Za-z_]\w*)\s*\([^)]*\)/g,
    go: /\bfunc\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)\s*\([^)]*\)/g,
    cpp: /(^|[;{}\n])\s*((?:(?:public|private|protected|static|virtual|explicit)\s+)*)?[\w:<>*&]+\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*{/g,
    py: /^\s*def\s+([A-Za-z_]\w*)\s*\(/gm,
  };
  const pattern = patterns[lang];
  const members = [];
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const name = lang === "go" || lang === "py" ? match[1] : match[3] ?? match[2];
    const prefix = lang === "go" || lang === "py" ? "" : match[2] ?? match[1] ?? "";
    if (["if", "for", "while", "switch", "catch"].includes(name)) continue;
    members.push({ name, kind: "method", visibility: visibility(prefix, lang, name) });
  }
  return members;
}

function fieldMembers(body, lang) {
  const members = [];
  const add = (name, prefix = "") => members.push({ name, kind: "field", visibility: visibility(prefix, lang, name) });
  if (lang === "py") {
    for (const match of body.matchAll(/\bself\.([A-Za-z_]\w*)\s*=/g)) add(match[1]);
    return members;
  }
  if (lang === "rs" || lang === "go" || lang === "cpp" || lang === "cs" || lang === "java" || lang === "ts") {
    for (const line of body.split(/[;\n]/)) {
      const assignment = line.indexOf("=");
      if ((line.includes("(") && (assignment === -1 || line.indexOf("(") < assignment)) || /^\s*(?:public|private|protected)\s*:/.test(line)) continue;
      const beforeAssignment = line.split(/[:=,]/, 1)[0].trim();
      const names = beforeAssignment.match(/[#A-Za-z_$][\w$]*/g) ?? [];
      const name = names.at(-1);
      const prefix = names.slice(0, -1).join(" ");
      if (name && !["return", "use", "type"].includes(name)) add(name, prefix);
    }
  }
  return members;
}

function forwardingPaths(body, methods) {
  return methods.flatMap((method) => {
    const expression = new RegExp(`${method.name}\\s*\\([^)]*\\)\\s*\\{?\\s*(?:return\\s+)?(?:this\\.|self\\.|[A-Za-z_]\\w*->)([A-Za-z_]\\w*)\\.([A-Za-z_]\\w*)\\s*\\(`).exec(body);
    return expression ? [{ member: method.name, target: `${expression[1]}.${expression[2]}` }] : [];
  });
}

function fieldDependencies(body) {
  const dependencies = [];
  for (const line of body.split(/[;\n]/)) {
    const assignment = line.indexOf("=");
    if (line.includes("(") && (assignment === -1 || line.indexOf("(") < assignment)) continue;
    const match = /(?:\bnew\s+|:\s*|\b)([A-Z][A-Za-z0-9_]*)\b/.exec(line);
    if (match) dependencies.push(match[1]);
  }
  return unique(dependencies);
}

function typeFacts(type, lang) {
  const methods = methodMembers(type.body.text, lang);
  const fields = fieldMembers(type.body.text, lang);
  const members = [...methods, ...fields].sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));
  return { name: type.name, kind: type.kind, members, dependencies: fieldDependencies(type.body.text), forwardingPaths: forwardingPaths(type.body.text, methods) };
}

function referencesFor(source, types, imports) {
  const names = [...source.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)].map((match) => match[0]);
  const importedNames = imports.flatMap((item) => item.split(/[./:]/)).filter((item) => /^[A-Z]/.test(item));
  return unique([...names, ...importedNames].filter((name) => !types.some((type) => type.name === name)));
}

export function extractArchitectureFacts(file) {
  const lang = LANGUAGE_BY_EXTENSION[extname(file.path).toLowerCase()];
  if (!lang) return { facts: { path: file.path, language: null, imports: [], references: [], types: [] }, errors: [] };
  const declared = declaredTypes(file.content, lang);
  if (declared.error) return { facts: null, errors: [declared.error] };
  const types = declared.types.map((type) => typeFacts(type, lang)).sort((left, right) => left.name.localeCompare(right.name));
  const imports = importsFor(file.content, lang);
  return { facts: { path: file.path, language: lang, imports, references: referencesFor(file.content, types, imports), types }, errors: [] };
}

function memberNames(type, kind) {
  return type.members.filter((member) => member.kind === kind).map((member) => member.name);
}

export function analyzeResponsibilityGrowth(beforeResult, afterResult) {
  const errors = [...beforeResult.errors, ...afterResult.errors];
  if (errors.length > 0 || !beforeResult.facts || !afterResult.facts) return { findings: [], errors };
  const beforeTypes = new Map(beforeResult.facts.types.map((type) => [type.name, type]));
  const addedImports = afterResult.facts.imports.filter((item) => !beforeResult.facts.imports.includes(item));
  const findings = [];
  for (const afterType of afterResult.facts.types) {
    const beforeType = beforeTypes.get(afterType.name);
    if (!beforeType) continue;
    const fields = memberNames(afterType, "field").filter((name) => !memberNames(beforeType, "field").includes(name));
    const methods = memberNames(afterType, "method").filter((name) => !memberNames(beforeType, "method").includes(name));
    const publicMembers = afterType.members.filter((member) => member.visibility === "public" && !beforeType.members.some((old) => old.kind === member.kind && old.name === member.name && old.visibility === "public")).map((member) => member.name);
    const dependencies = afterType.dependencies.filter((name) => !beforeType.dependencies.includes(name));
    if (addedImports.length || fields.length || methods.length || publicMembers.length || dependencies.length) {
      findings.push({ type: afterType.name, severity: "review", imports: addedImports, dependencies, fields, methods, publicMembers: unique(publicMembers) });
    }
  }
  return { findings: findings.sort((left, right) => left.type.localeCompare(right.type)), errors: [] };
}

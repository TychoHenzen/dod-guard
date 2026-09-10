import { unique, visibility } from "./architecture-language.mjs";

function isCallLine(line) {
  const assignment = line.indexOf("=");
  if (!line.includes("(")) return false;
  return assignment === -1 || line.indexOf("(") < assignment;
}

function addMember(members, { name, lang, prefix = "" }) {
  if (!name || ["return", "use", "type"].includes(name)) return;
  members.push({
    name,
    kind: "field",
    visibility: visibility(prefix, lang, name),
  });
}

function pythonFields(body, lang) {
  const members = [];
  for (const match of body.matchAll(/\bself\.([A-Za-z_]\w*)\s*=/g)) {
    addMember(members, { name: match[1], lang });
  }
  return members;
}

function braceFields(body, lang) {
  const members = [];
  for (const line of body.split(/[;\n]/)) {
    if (isFieldLine(line)) continue;
    const names =
      line
        .split(/[:=,]/, 1)[0]
        .trim()
        .match(/[#A-Za-z_$][\w$]*/g) ?? [];
    addMember(members, {
      name: names.at(-1),
      lang,
      prefix: names.slice(0, -1).join(" "),
    });
  }
  return members;
}

function isFieldLine(line) {
  if (isCallLine(line)) return true;
  return /^\s*(?:public|private|protected)\s*:/.test(line);
}

export function fieldMembers(body, lang) {
  return lang === "py" ? pythonFields(body, lang) : braceFields(body, lang);
}

export function forwardingPaths(body, methods) {
  return methods.flatMap((method) => {
    const expression = new RegExp(
      method.name +
        "\\s*\\([^)]*\\)\\s*\\{?\\s*(?:return\\s+)?" +
        "(?:this\\.|self\\.|[A-Za-z_]\\w*->)([A-Za-z_]\\w*)" +
        "\\.([A-Za-z_]\\w*)\\s*\\(",
    ).exec(body);
    return expression
      ? [{ member: method.name, target: expression[1] + "." + expression[2] }]
      : [];
  });
}

export function fieldDependencies(body) {
  const dependencies = [];
  for (const line of body.split(/[;\n]/)) {
    if (isCallLine(line)) continue;
    const match = /(?:\bnew\s+|:\s*|\b)([A-Z][A-Za-z0-9_]*)\b/.exec(line);
    if (match) dependencies.push(match[1]);
  }
  return unique(dependencies);
}

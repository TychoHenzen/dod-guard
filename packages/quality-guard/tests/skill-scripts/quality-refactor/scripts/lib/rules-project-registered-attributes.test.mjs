import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileWithCode,
  reachabilityRulesFor,
} from "./rules-project-fixtures.test.mjs";

const unrelated = fileWithCode("Scripts/Other.cs", "// unrelated", {
  lang: "cs",
});

// A repository that builds every [Service] class by reflection.
const SERVICE = { registeredAttributes: ["Service"] };

const REGISTERED_FORMS = [
  "[Service]",
  // biome-ignore lint/security/noSecrets: C# attribute text, not a secret
  "[Service(typeof(IRegistry))]",
  "[ServiceAttribute]",
  "[Godot.Service]",
  "[type: Service]",
  "[Tool, Service]",
  "[Service, Tool]",
  "[Tool(a > b), Service]",
  "[Handler<A, B>, Service]",
  // biome-ignore lint/security/noSecrets: C# attribute text, not a secret
  "[Service<IRegistry>]",
  // biome-ignore lint/security/noSecrets: C# attribute text, not a secret
  "[Service]\n[Tool]",
  // biome-ignore lint/security/noSecrets: C# attribute text, not a secret
  "[Service]\nstatic",
];

const LOOK_ALIKES = [
  "[ServiceX]",
  // biome-ignore lint/security/noSecrets: C# attribute text, not a secret
  "[Tool(typeof(Service))]",
  "[Tool(1, Service, 3)]",
  "[assembly: Service]",
  "[Service]\n;",
];

const GLOBAL_CLASS_FORMS = [
  "[GlobalClass]",
  // biome-ignore lint/security/noSecrets: C# attribute text, not a secret
  "[GlobalClassAttribute]",
  "[Godot.GlobalClassAttribute]",
  "[global::Godot.GlobalClass]",
];

function rulesFor(attributes, settings) {
  const code = `${attributes}\npublic partial class Registry : Node {}`;
  const files = [
    fileWithCode("Scripts/Registry.cs", code, { lang: "cs" }),
    unrelated,
  ];
  return reachabilityRulesFor("Registry", files, settings);
}

test("a configured attribute registers its class", () => {
  for (const attributes of REGISTERED_FORMS) {
    assert.deepEqual(rulesFor(attributes, SERVICE), [], attributes);
  }
});

test("a configured name ending in Attribute matches the short form", () => {
  const settings = { registeredAttributes: ["ServiceAttribute"] };
  assert.deepEqual(rulesFor("[Service]", settings), []);
});

test("without the setting a [Service] class is dead", () => {
  assert.deepEqual(rulesFor("[Service]", {}), ["dead-export"]);
});

test("a look-alike, an argument, another target or a gap is not the attribute", () => {
  for (const attributes of LOOK_ALIKES) {
    assert.deepEqual(
      rulesFor(attributes, SERVICE),
      ["dead-export"],
      attributes,
    );
  }
});

test("GlobalClass is built in, in its long and qualified forms", () => {
  for (const attributes of GLOBAL_CLASS_FORMS) {
    assert.deepEqual(rulesFor(attributes, {}), [], attributes);
  }
});

const metadataDefaults = {
  key: "synthetic.entry",
  title: "ok",
  chapter: "synthetic",
  section: "synthetic",
  sources: ["sources:", "  - label: fixture"],
  suffix: [] as string[],
};

export function document(frontMatter: string, content = "synthetic content"): string {
  return ["---", frontMatter, "---", content].join("\n");
}

export function metadata(options: Partial<typeof metadataDefaults> = {}): string {
  const values = { ...metadataDefaults, ...options } as typeof metadataDefaults;
  return [
    `key: ${values.key}`,
    `title: ${values.title}`,
    `chapter: ${values.chapter}`,
    `section: ${values.section}`,
    "summary: ok",
    ...values.sources,
    ...values.suffix,
  ].join("\n");
}

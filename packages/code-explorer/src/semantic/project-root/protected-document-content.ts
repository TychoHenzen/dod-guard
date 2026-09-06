export type ProtectedDocumentContent = Readonly<{
  language_id: "rust" | "python" | "csharp";
  bytes: string;
}>;

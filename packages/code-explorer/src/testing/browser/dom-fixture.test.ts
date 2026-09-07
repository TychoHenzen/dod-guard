import { replaceGlobal } from "./fixtures/globals.test.js";

export class FakeElement {
  dataset: Record<string, string> = {};
  textContent = "";
  innerHTML = "";
  outerHTML = "";
  readonly children: FakeElement[] = [];
  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }
}

export function installDocumentFixture(
  elements: Record<string, FakeElement | undefined>,
  lists: Record<string, FakeElement[]> = {},
) {
  return replaceGlobal("document", {
    createElement: () => new FakeElement(),
    querySelector: (selector: string) => elements[selector] ?? null,
    querySelectorAll: (selector: string) => lists[selector] ?? [],
  });
}

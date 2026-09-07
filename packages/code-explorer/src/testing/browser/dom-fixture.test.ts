type Listener = () => void;

export class FakeElement {
  dataset: Record<string, string> = {};
  textContent = "";
  innerHTML = "";
  outerHTML = "";
  readonly children: FakeElement[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(name: string, listener: Listener): void {
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
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => new FakeElement(),
      querySelector: (selector: string) => elements[selector] ?? null,
      querySelectorAll: (selector: string) => lists[selector] ?? [],
    },
  });
  return () => {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  };
}

// dom.mjs - the small element helper the views are written against.

function applyAttr(node, key, value) {
  if (key === "class") node.className = value;
  else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
  else if (value !== false && value != null) node.setAttribute(key, value);
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) applyAttr(node, key, value);
  for (const child of [children].flat(2)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function replace(host, ...children) {
  host.replaceChildren(...children.filter(Boolean));
  return host;
}

/** First line of a requirement's text, used as its collapsed summary. */
export function firstLine(text) {
  const line = String(text ?? "").trim().split("\n")[0];
  return line.length > 110 ? `${line.slice(0, 107)}...` : line;
}

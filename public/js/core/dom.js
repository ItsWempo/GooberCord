// The one element builder. Every module creates markup through h() — the
// rule is what keeps the rewrite free of inline HTML strings (and with them
// the injection class of bugs): attributes are set through the DOM API, text
// through text nodes, and children through appendChild. No h() caller can
// hand over a string that parses as markup.

// h(tag, props, ...children) -> Element
//
// props (all optional):
//   class   class list: a string, or an array where falsy entries drop out
//   text    textContent (a shorthand for a single string child)
//   dataset { name: value } — the object spelling of data-* attributes
//   on*     addEventListener(name, fn) — "onclick", "onkeydown", ...
//   *       setAttribute(name, value); true -> bare ("", boolean attribute),
//           false/null/undefined -> absent
//
// children: strings become text nodes, Nodes append directly, arrays
// flatten, null/undefined/false are skipped.

export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) applyProps(node, props);
  appendChildren(node, children);
  return node;
}

// svg(tag, props, ...children) — the SVG-namespaced twin for inline icons;
// SVG attributes are always set through setAttribute (no className idiom
// there), everything else matches h().
export function svg(tag, props, ...children) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (props) applyProps(node, props, true);
  appendChildren(node, children);
  return node;
}

function applyProps(node, props, svgElement = false) {
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "class") {
      const list = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
      if (svgElement) node.setAttribute("class", list);
      else node.className = list;
    } else if (key === "dataset") {
      for (const [name, entry] of Object.entries(value)) {
        node.dataset[name] = entry;
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else if (key === "text") {
      node.textContent = value;
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
}

function appendChildren(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (child instanceof Node) {
      node.append(child);
    } else {
      node.append(document.createTextNode(String(child)));
    }
  }
}

// clear(node) — the one replace-children idiom every renderer uses when a
// route redraw; the container is emptied, not disposed, so listeners the
// router itself owns (the global link intercept) never detach.
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// Renders an arbitrary AST node into a collapsible tree view. The renderer
// is structure-blind: any property whose value is a plain object with a
// `type: string` is treated as a child node, any array of such objects is a
// child list, everything else is a scalar attribute. This stays in sync with
// `src/ast/index.ts` automatically because the AST contract is "every node
// has a `type` discriminator".

type Plain = string | number | boolean | null | undefined;

function isASTNodeLike(v: unknown): v is { type: string } & Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as { type?: unknown }).type === 'string'
  );
}

function isASTNodeArray(v: unknown): v is Array<{ type: string }> {
  return Array.isArray(v) && v.length > 0 && v.every(isASTNodeLike);
}

function renderScalar(value: Plain): HTMLElement {
  const span = document.createElement('span');
  if (typeof value === 'string') {
    span.classList.add('ast-attr-val-string');
    // Quote the string and JSON-escape so newlines stay readable.
    span.textContent = JSON.stringify(value);
  } else if (typeof value === 'number') {
    span.classList.add('ast-attr-val-number');
    span.textContent = String(value);
  } else if (typeof value === 'boolean') {
    span.classList.add('ast-attr-val-boolean');
    span.textContent = String(value);
  } else if (value === null) {
    span.classList.add('ast-attr-val-boolean');
    span.textContent = 'null';
  } else {
    span.classList.add('ast-attr-val-boolean');
    span.textContent = 'undefined';
  }
  return span;
}

function renderNode(
  node: { type: string } & Record<string, unknown>,
  depth: number,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.classList.add('ast-node');

  const header = document.createElement('div');
  wrap.appendChild(header);

  const childGroups: Array<{ key: string; nodes: Array<{ type: string } & Record<string, unknown>> }> = [];
  const scalarParts: Array<{ key: string; value: Plain }> = [];

  for (const [key, raw] of Object.entries(node)) {
    if (key === 'type') continue;
    if (isASTNodeLike(raw)) {
      childGroups.push({ key, nodes: [raw] });
    } else if (isASTNodeArray(raw)) {
      childGroups.push({ key, nodes: raw as Array<{ type: string } & Record<string, unknown>> });
    } else if (
      raw === undefined ||
      raw === null ||
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      scalarParts.push({ key, value: raw as Plain });
    } else {
      // Unrecognised shape — JSON-stringify as a single token. Keeps the tree
      // honest about contents we don't have a renderer for.
      scalarParts.push({ key, value: JSON.stringify(raw) });
    }
  }

  const hasChildren = childGroups.length > 0;
  const toggle = document.createElement('span');
  toggle.classList.add('ast-toggle');
  toggle.textContent = hasChildren ? '▼' : '·';
  header.appendChild(toggle);

  const typeSpan = document.createElement('span');
  typeSpan.classList.add('ast-type');
  typeSpan.textContent = node.type;
  header.appendChild(typeSpan);

  for (const part of scalarParts) {
    if (part.value === undefined) continue;
    header.appendChild(document.createTextNode(' '));
    const k = document.createElement('span');
    k.classList.add('ast-attr-key');
    k.textContent = `${part.key}=`;
    header.appendChild(k);
    header.appendChild(renderScalar(part.value));
  }

  if (!hasChildren) return wrap;

  const childWrap = document.createElement('div');
  childWrap.classList.add('ast-node-children');
  for (const group of childGroups) {
    if (group.nodes.length === 1) {
      const inline = renderNode(group.nodes[0]!, depth + 1);
      // Prefix inline single children with the field name so e.g. a
      // `link.children` group is distinguishable from a `link.target` group.
      const label = document.createElement('div');
      label.classList.add('ast-attr-key');
      label.textContent = `${group.key}:`;
      childWrap.appendChild(label);
      childWrap.appendChild(inline);
    } else {
      const label = document.createElement('div');
      label.classList.add('ast-attr-key');
      label.textContent = `${group.key} [${group.nodes.length}]:`;
      childWrap.appendChild(label);
      for (const child of group.nodes) {
        childWrap.appendChild(renderNode(child, depth + 1));
      }
    }
  }
  wrap.appendChild(childWrap);

  // Collapse-on-click. Keep the top two levels open by default so readers see
  // the document's shape without any clicking; deeper subtrees collapse only
  // after manual interaction.
  const setOpen = (open: boolean) => {
    childWrap.style.display = open ? '' : 'none';
    toggle.textContent = open ? '▼' : '▶';
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(childWrap.style.display === 'none');
  });

  return wrap;
}

export function renderAST(target: HTMLElement, ast: unknown): void {
  target.replaceChildren();
  if (!isASTNodeLike(ast)) {
    const empty = document.createElement('div');
    empty.classList.add('ast-empty');
    empty.textContent = '(no AST)';
    target.appendChild(empty);
    return;
  }
  target.appendChild(renderNode(ast, 0));
}

export function renderASTError(target: HTMLElement, message: string): void {
  target.replaceChildren();
  const err = document.createElement('div');
  err.classList.add('ast-empty');
  err.style.color = 'var(--bad)';
  err.textContent = message;
  target.appendChild(err);
}

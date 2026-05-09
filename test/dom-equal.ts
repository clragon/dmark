// Normalized DOM equality for comparing rendered html outputs from two parsers
// against the same input. The two outputs are considered equal if their parsed
// DOMs match after the normalization rules below. Spurious differences
// (whitespace runs, attribute order, ignorable class names) do not cause
// spurious failures.
//
// Normalization rules (applied to both sides before comparing):
//   1. Tag names lowercased (parse5 default).
//   2. Attributes sorted alphabetically by name.
//   3. Attributes whose name is in `dropAttrs` are removed entirely.
//   4. The `class` attribute is filtered: any class token in `ignoreClasses` is
//      dropped; if no tokens remain, the whole attribute is dropped.
//   5. Whitespace runs in text nodes are collapsed to a single space, EXCEPT
//      inside elements listed in `preserveWhitespaceTags` (default: pre, code).
//   6. Text nodes that become empty after collapsing are removed.
//   7. <br> and other void elements are written as self-closing-equivalent by
//      parse5.serialize regardless of input form.
//
// On mismatch, returns a unified-style diff truncated to a useful window so
// failing assertions stay readable.

import {
  parseFragment,
  serialize,
  defaultTreeAdapter,
  type DefaultTreeAdapterMap,
} from 'parse5';

type Doc = DefaultTreeAdapterMap['documentFragment'];
type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
type TextNode = DefaultTreeAdapterMap['textNode'];

export interface DomEqualOptions {
  /** Class tokens to strip from `class` attributes before comparing. */
  ignoreClasses?: string[];
  /** Attribute names to drop entirely before comparing. */
  dropAttrs?: string[];
  /** Tags whose text-node whitespace is left untouched. Default: pre, code. */
  preserveWhitespaceTags?: string[];
}

export interface DomEqualResult {
  equal: boolean;
  /** Short unified diff between the normalized serializations, only set when not equal. */
  diff?: string;
  /** The normalized canonical form of the left input. Handy for debugging tests. */
  leftCanonical: string;
  /** The normalized canonical form of the right input. */
  rightCanonical: string;
}

const DEFAULT_PRESERVE_WHITESPACE = new Set(['pre', 'code']);
const WHITESPACE_RUN = /\s+/g;

function isElement(node: Node): node is Element {
  return 'tagName' in node && Array.isArray((node as Element).attrs);
}

function isTextNode(node: Node): node is TextNode {
  return node.nodeName === '#text';
}

function getChildren(node: Node): Node[] {
  return defaultTreeAdapter.getChildNodes(node as Doc) ?? [];
}

function detachChild(child: TextNode): void {
  defaultTreeAdapter.detachNode(child);
}

function normalizeAttrs(
  el: Element,
  ignoreClasses: Set<string>,
  dropAttrs: Set<string>,
): void {
  const next: typeof el.attrs = [];
  for (const attr of el.attrs) {
    if (dropAttrs.has(attr.name)) continue;
    if (attr.name === 'class') {
      const tokens = attr.value
        .split(/\s+/)
        .filter((t) => t.length > 0 && !ignoreClasses.has(t));
      if (tokens.length === 0) continue;
      next.push({ name: 'class', value: tokens.sort().join(' ') });
      continue;
    }
    next.push({ name: attr.name, value: attr.value });
  }
  next.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  el.attrs = next;
}

function walkAndNormalize(
  node: Node,
  preserveWhitespace: boolean,
  preserveTags: Set<string>,
  ignoreClasses: Set<string>,
  dropAttrs: Set<string>,
): void {
  if (isElement(node)) {
    normalizeAttrs(node, ignoreClasses, dropAttrs);
  }

  const childPreserve =
    preserveWhitespace ||
    (isElement(node) && preserveTags.has(node.tagName.toLowerCase()));

  // Snapshot children since the loop mutates during iteration.
  const children = [...getChildren(node)];
  for (const child of children) {
    if (isTextNode(child)) {
      if (!childPreserve) {
        const collapsed = child.value.replace(WHITESPACE_RUN, ' ');
        if (collapsed.length === 0 || /^\s*$/.test(collapsed)) {
          // Whitespace-only text between block elements; drop it.
          // (Between inlines a single space carries meaning, but parse5
          // returns the actual whitespace; if the original was
          // whitespace-only it was insignificant on the rendering side too.)
          if (collapsed.trim().length === 0 && !isInlineBoundary(node, child)) {
            detachChild(child);
            continue;
          }
        }
        child.value = collapsed;
      }
      continue;
    }
    walkAndNormalize(
      child,
      childPreserve,
      preserveTags,
      ignoreClasses,
      dropAttrs,
    );
  }

  // Browsers strip leading/trailing whitespace at block boundaries (e.g.
  // "<p> foo </p>" renders identically to "<p>foo</p>"). After normalizing
  // children, trim whitespace from the first/last text-node child of any
  // block element.
  if (!childPreserve && isElement(node) && BLOCK_TAGS.has(node.tagName.toLowerCase())) {
    trimBlockEdges(node);
  }
}

function trimBlockEdges(el: Element): void {
  const kids = getChildren(el);
  const first = kids[0];
  if (first && isTextNode(first)) {
    first.value = first.value.replace(/^\s+/, '');
    if (first.value === '') detachChild(first);
  }
  const remaining = getChildren(el);
  const last = remaining[remaining.length - 1];
  if (last && isTextNode(last)) {
    last.value = last.value.replace(/\s+$/, '');
    if (last.value === '') detachChild(last);
  }
}

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'br',
  'caption',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hr',
  'html',
  'li',
  'main',
  'nav',
  'noscript',
  'ol',
  'option',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

function isInlineBoundary(parent: Node, _child: Node): boolean {
  // True when the parent is an inline-context element where a single space
  // between children carries meaning. Defaults to preserving spaces when the
  // parent is not a known block container.
  if (!isElement(parent)) return true;
  return !BLOCK_TAGS.has(parent.tagName.toLowerCase());
}

function normalize(html: string, options: DomEqualOptions): string {
  const ignoreClasses = new Set(options.ignoreClasses ?? []);
  const dropAttrs = new Set(options.dropAttrs ?? []);
  const preserveTags = new Set(
    (options.preserveWhitespaceTags ?? [...DEFAULT_PRESERVE_WHITESPACE]).map(
      (t) => t.toLowerCase(),
    ),
  );
  const fragment = parseFragment(html);
  walkAndNormalize(fragment, false, preserveTags, ignoreClasses, dropAttrs);
  return serialize(fragment);
}

function shortDiff(left: string, right: string, window = 80): string {
  const min = Math.min(left.length, right.length);
  let i = 0;
  while (i < min && left[i] === right[i]) i++;
  const start = Math.max(0, i - 20);
  const leftSlice = left.slice(start, i + window);
  const rightSlice = right.slice(start, i + window);
  return [
    `first diff at offset ${i}:`,
    `  left:  ${JSON.stringify(leftSlice)}`,
    `  right: ${JSON.stringify(rightSlice)}`,
  ].join('\n');
}

export function domEqual(
  left: string,
  right: string,
  options: DomEqualOptions = {},
): DomEqualResult {
  const leftCanonical = normalize(left, options);
  const rightCanonical = normalize(right, options);
  if (leftCanonical === rightCanonical) {
    return { equal: true, leftCanonical, rightCanonical };
  }
  return {
    equal: false,
    diff: shortDiff(leftCanonical, rightCanonical),
    leftCanonical,
    rightCanonical,
  };
}

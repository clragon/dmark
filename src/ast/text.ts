// Text utilities shared by the dtext parser and the markdown adapter when
// building AST nodes from a source string. Both pipelines apply the same
// lowercase / URI-escape rules for wiki tags, post-search tags, and any
// other identifier the renderer round-trips through ruby's CGI.escape.

// Lowercase ASCII letters only, leaving non-ASCII characters untouched.
// Ruby's dtext normalizes wiki/post-search keys with `String#downcase` in a
// way that leaves Unicode letters alone (verified against the oracle:
// `[[Ōmukade]]` keeps the `Ō` in the URL, while `[[Foo]]` becomes `foo`).
// JavaScript's `String.prototype.toLowerCase` is Unicode-aware; this
// helper is the ASCII-only equivalent.
//
// Fast path: most tag-name strings are already entirely lowercase. Test for
// any uppercase before allocating a new string. `RE_HAS_UPPER.test` lowers
// to a tight scan, while `replace(/[A-Z]/g, fn)` always produces a fresh
// string even when nothing needs folding.
const RE_HAS_UPPER = /[A-Z]/;
export function asciiLowercase(s: string): string {
  if (!RE_HAS_UPPER.test(s)) return s;
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

// Match ruby's CGI.escape / URI::DEFAULT_PARSER.escape behavior: encode
// everything outside RFC 3986 unreserved (A-Z a-z 0-9 - _ . ~). JS's
// `encodeURIComponent` leaves `!'()*` unencoded; ruby encodes them.
//
// Fast path: the secondary `replace(/[!'()*]/g, ...)` only matters when at
// least one of those five chars survived `encodeURIComponent` unencoded. A
// quick test on the original string skips the second pass when the string
// contains none of them (the common case).
const RE_RUBY_EXTRA_ESCAPES = /[!'()*]/;
export function rubyUriEscape(str: string): string {
  const encoded = encodeURIComponent(str);
  if (!RE_RUBY_EXTRA_ESCAPES.test(encoded)) return encoded;
  return encoded.replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

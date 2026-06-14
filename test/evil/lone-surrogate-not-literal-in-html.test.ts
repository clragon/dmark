// Sibling of test/evil/null-byte-not-literal-in-html.test.ts. A lone
// UTF-16 surrogate (U+D800-U+DFFF without its paired half) is not a
// valid Unicode scalar and never encodes to legal UTF-8 bytes. Ruby's
// dtext rejects an input containing a lone surrogate with `DText::Error`
// ("invalid byte sequence in UTF-8" once the input is re-encoded), so
// oracle responds with `{ error, html: undefined }`.
//
// dmark currently passes the lone surrogate straight through:
//   convertDTextToHtml('a\uDC00b')  ->  '<p>a\uDC00b</p>'
// That output cannot be re-encoded to a valid HTTP body or written to a
// file with `writeFileSync(..., 'utf-8')` without `WriteError`. Same
// shape as the NUL byte fix: the parser must never embed an invalid
// Unicode scalar literally in rendered HTML.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';

describe('lone surrogate must not appear literally in rendered HTML', () => {
  it('does not emit a bare low surrogate in the output of `a\\uDC00b`', () => {
    const html = convertDTextToHtml('a\uDC00b');
    expect(/[\uD800-\uDFFF]/.test(html)).toBe(false);
  });
});

// A literal NUL byte (U+0000) in HTML output is invalid: the byte is
// neither well-formed UTF-8 nor a legal HTML character. Ruby's dtext
// rejects an input containing a NUL with `DText::Error: invalid byte
// sequence in UTF-8`, so the oracle response for `a\x00b` is
//   { error: "dtext_error", message: "invalid byte sequence in UTF-8" }
// (no `html` field at all).
//
// dmark passes the NUL through verbatim, so `convertDTextToHtml("a\x00b")` is
// `"<p>a\x00b</p>"` with the NUL inside `<p>`. That output is unsafe to
// emit in any real consumer (browser, JSON encoder, log file) and
// trivially divergent from the oracle's reject behaviour.
//
// The parity invariant should be: at minimum, dmark must NOT embed a
// literal NUL in its rendered HTML. Whether it errors, drops the byte,
// or replaces it with U+FFFD is a downstream decision, but a verbatim
// pass-through is wrong.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';

describe('null byte must not appear literally in rendered HTML', () => {
  it('does not emit U+0000 in the output of `a\\x00b`', () => {
    const html = convertDTextToHtml('a\x00b');
    expect(html.includes('\x00')).toBe(false);
  });
});

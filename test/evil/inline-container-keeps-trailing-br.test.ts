// Ragel's inline scanner fires `newline => append("<br>");` (line 549) for
// every newline encountered inside an inline tag, including the newline
// that sits immediately before the closing tag. Closing the inline tag
// then runs `dstack_close_inline(INLINE_B, "</strong>")` - no scrubbing,
// the previously-emitted `<br>` stays.
//
// So `[b]\nbody\n[/b]` round-trips through ragel as
//   <p><strong><br>body<br></strong></p>
// (leading <br> from the first newline, trailing <br> from the last).
//
// TS's `parseInlineContainer` runs `trimTrailingLineBreaks` on exit,
// which is correct for the document/paragraph buffer (oracle does close
// `<p>` cleanly without a trailing `<br></p>`) but wrong for an inline
// container - the inline scope keeps the trailing `<br>`.

import { describe, it, expect } from 'vitest';

import { convertDTextToHtml } from '@dmark/convert';
import { renderViaOracle } from '../oracle';

describe('inline container keeps the <br> right before its close', () => {
  it('preserves the trailing newline-as-<br> inside `[b]\\nbody\\n[/b]`', async () => {
    const input = '[b]\nbody\n[/b]';
    const oracle = await renderViaOracle(input);
    const dmark = convertDTextToHtml(input);
    expect(dmark).toBe(oracle.html);
  });
});

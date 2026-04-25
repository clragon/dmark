import { describe, expect, it } from 'vitest';
import { domEqual } from './dom-equal';

describe('domEqual', () => {
  it('treats identical html as equal', () => {
    const r = domEqual('<p>hi</p>', '<p>hi</p>');
    expect(r.equal).toBe(true);
  });

  it('ignores attribute order', () => {
    const r = domEqual(
      '<a href="/x" class="y">hi</a>',
      '<a class="y" href="/x">hi</a>',
    );
    expect(r.equal).toBe(true);
  });

  it('collapses whitespace runs in text nodes', () => {
    const r = domEqual('<p>foo   bar</p>', '<p>foo bar</p>');
    expect(r.equal).toBe(true);
  });

  it('drops whitespace-only text between block elements', () => {
    const r = domEqual(
      '<div><p>a</p>\n  <p>b</p></div>',
      '<div><p>a</p><p>b</p></div>',
    );
    expect(r.equal).toBe(true);
  });

  it('preserves whitespace inside <pre>', () => {
    const r = domEqual(
      '<pre>line1\n  line2</pre>',
      '<pre>line1 line2</pre>',
    );
    expect(r.equal).toBe(false);
    expect(r.diff).toContain('line1');
  });

  it('preserves whitespace inside <code>', () => {
    const r = domEqual('<code>a  b</code>', '<code>a b</code>');
    expect(r.equal).toBe(false);
  });

  it('drops ignored class tokens before comparing', () => {
    const r = domEqual(
      '<a class="dtext-link styled-link" href="/x">hi</a>',
      '<a class="dtext-link" href="/x">hi</a>',
      { ignoreClasses: ['styled-link'] },
    );
    expect(r.equal).toBe(true);
  });

  it('drops the class attribute entirely when all tokens are ignored', () => {
    const r = domEqual(
      '<a class="styled-link" href="/x">hi</a>',
      '<a href="/x">hi</a>',
      { ignoreClasses: ['styled-link'] },
    );
    expect(r.equal).toBe(true);
  });

  it('drops named attributes via dropAttrs', () => {
    const r = domEqual(
      '<a href="/x" data-id="1">hi</a>',
      '<a href="/x">hi</a>',
      { dropAttrs: ['data-id'] },
    );
    expect(r.equal).toBe(true);
  });

  it('flags real content differences with a useful diff', () => {
    const r = domEqual('<p>foo bar</p>', '<p>foo baz</p>');
    expect(r.equal).toBe(false);
    expect(r.diff).toContain('first diff at offset');
    expect(r.diff).toContain('bar');
    expect(r.diff).toContain('baz');
  });

  it('treats nested differences as not equal', () => {
    const r = domEqual('<p><b>x</b></p>', '<p><i>x</i></p>');
    expect(r.equal).toBe(false);
  });

  it('does not collapse a meaningful single space between inline siblings', () => {
    const r = domEqual('<p>foo <b>bar</b></p>', '<p>foo<b>bar</b></p>');
    expect(r.equal).toBe(false);
  });
});

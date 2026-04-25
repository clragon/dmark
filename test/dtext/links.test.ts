import { describe, expect, it } from 'vitest';

import { parseDText } from '@dmark/dtext';

describe('DText Links and References', () => {
  describe('URL Links', () => {
    it('parses basic URL', () => {
      const result = parseDText('https://example.com');
      expect(result).toContain(
        '<a rel="nofollow" class="dtext-link" href="https://example.com">',
      );
      expect(result).toContain('https://example.com</a>');
    });

    it('parses HTTP URL', () => {
      const result = parseDText('http://example.com');
      expect(result).toContain('href="http://example.com"');
    });

    it('parses delimited URL', () => {
      const result = parseDText('<https://example.com/link_(test)>');
      expect(result).toContain('href="https://example.com/link_(test)"');
    });
  });

  describe('Textile Links', () => {
    it('parses basic textile link', () => {
      const result = parseDText('"A link":https://example.com/');
      expect(result).toContain(
        '<a rel="nofollow" class="dtext-link dtext-external-link"',
      );
      expect(result).toContain('href="https://example.com/"');
      expect(result).toContain('>A link</a>');
    });

    it('parses bracketed textile link', () => {
      const result = parseDText('"A link":[https://example.com/link_(test)]');
      expect(result).toContain('href="https://example.com/link_(test)"');
      expect(result).toContain('>A link</a>');
    });

    it('parses relative link', () => {
      const result = parseDText('"A link":/users');
      expect(result).toContain('href="/users"');
    });
  });

  describe('Wiki Links', () => {
    it('parses basic wiki link', () => {
      const result = parseDText('[[simple background]]');
      expect(result).toContain(
        '<a rel="nofollow" class="dtext-link dtext-wiki-link"',
      );
      expect(result).toContain(
        'href="/wiki_pages/show_or_new?title=simple_background"',
      );
      expect(result).toContain('>simple background</a>');
    });

    it('parses wiki link with title', () => {
      const result = parseDText('[[wiki page|Some Text]]');
      expect(result).toContain(
        'href="/wiki_pages/show_or_new?title=wiki_page"',
      );
      expect(result).toContain('>Some Text</a>');
    });

    it('parses anchor link', () => {
      const result = parseDText('[[#quote]]');
      expect(result).toContain('href="#quote"');
      expect(result).toContain('>#quote</a>');
    });

    it('parses anchor link with title', () => {
      const result = parseDText('[[#anchors|Anchors work too!]]');
      expect(result).toContain('href="#anchors"');
      expect(result).toContain('>Anchors work too!</a>');
    });

    it('parses wiki link with anchor', () => {
      const result = parseDText('[[mammal#equine]]');
      expect(result).toContain(
        'href="/wiki_pages/show_or_new?title=mammal#equine"',
      );
    });
  });

  describe('Post Search Links', () => {
    it('parses basic post search link', () => {
      const result = parseDText('{{mammal -cat}}');
      expect(result).toContain(
        '<a rel="nofollow" class="dtext-link dtext-post-search-link"',
      );
      expect(result).toContain('href="/posts?tags=mammal%20-cat"');
      expect(result).toContain('>mammal -cat</a>');
    });

    it('parses post search link with title', () => {
      const result = parseDText('{{search|Custom Title}}');
      expect(result).toContain('href="/posts?tags=search"');
      expect(result).toContain('>Custom Title</a>');
    });
  });

  describe('ID Links', () => {
    it('parses post link', () => {
      const result = parseDText('post #1234');
      expect(result).toContain(
        'class="dtext-link dtext-id-link dtext-post-id-link"',
      );
      expect(result).toContain('href="/posts/1234"');
      expect(result).toContain('>post #1234</a>');
    });

    it('parses post changes link', () => {
      const result = parseDText('post changes #1234');
      expect(result).toContain('dtext-post-changes-for-id-link');
      expect(result).toContain('href="/post_versions?search[post_id]=1234"');
    });

    it('parses topic link', () => {
      const result = parseDText('topic #1234');
      expect(result).toContain('dtext-forum-topic-id-link');
      expect(result).toContain('href="/forum_topics/1234"');
    });

    it('parses comment link', () => {
      const result = parseDText('comment #1234');
      expect(result).toContain('dtext-comment-id-link');
      expect(result).toContain('href="/comments/1234"');
    });

    it('parses blip link', () => {
      const result = parseDText('blip #1234');
      expect(result).toContain('dtext-blip-id-link');
      expect(result).toContain('href="/blips/1234"');
    });

    it('parses pool link', () => {
      const result = parseDText('pool #1234');
      expect(result).toContain('dtext-pool-id-link');
      expect(result).toContain('href="/pools/1234"');
    });

    it('parses set link', () => {
      const result = parseDText('set #1234');
      expect(result).toContain('dtext-set-id-link');
      expect(result).toContain('href="/post_sets/1234"');
    });

    it('parses takedown link', () => {
      const result = parseDText('takedown #1234');
      expect(result).toContain('dtext-takedown-id-link');
      expect(result).toContain('href="/takedowns/1234"');
    });

    it('parses record link', () => {
      const result = parseDText('record #4321');
      expect(result).toContain('dtext-user-feedback-id-link');
      expect(result).toContain('href="/user_feedbacks/4321"');
    });

    it('parses ticket link', () => {
      const result = parseDText('ticket #1234');
      expect(result).toContain('dtext-ticket-id-link');
      expect(result).toContain('href="/tickets/1234"');
    });
  });

  describe('Internal Anchors', () => {
    it('parses internal anchor', () => {
      const result = parseDText('[#some_anchor]');
      expect(result).toContain('<a id="some_anchor"></a>');
    });

    it('lowercases anchor names', () => {
      const result = parseDText('[#My_Anchor]');
      expect(result).toContain('<a id="my_anchor"></a>');
    });
  });

  describe('Textile links in context', () => {
    it('parses standalone textile link with bracketed internal URL', () => {
      const result = parseDText('"Privileged":[/help/accounts#privileged]');
      expect(result).toBe(
        '<p><a rel="nofollow" class="dtext-link" href="/help/accounts#privileged">Privileged</a></p>',
      );
    });

    it('parses text followed by space and textile link', () => {
      const result1 = parseDText('"Privileged":[/help/accounts#privileged]');
      console.log('Standalone:', result1);

      const result2 = parseDText(
        'Text "Privileged":[/help/accounts#privileged]',
      );
      console.log('With text before:', result2);

      expect(result2).toContain(
        '<a rel="nofollow" class="dtext-link" href="/help/accounts#privileged">Privileged</a>',
      );
    });

    it('parses textile link followed by space and text', () => {
      const result = parseDText(
        '"Privileged":[/help/accounts#privileged] text',
      );
      expect(result).toContain(
        '<a rel="nofollow" class="dtext-link" href="/help/accounts#privileged">Privileged</a>',
      );
    });

    it('parses textile link with space before ampersand', () => {
      const result = parseDText('"Privileged":[/help/accounts#privileged] &');
      expect(result).toContain(
        '<a rel="nofollow" class="dtext-link" href="/help/accounts#privileged">Privileged</a>',
      );
    });
  });
});

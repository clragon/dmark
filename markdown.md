# ✒️ Markdown

State of this document: NOT FINAL


Transitioning from [DText](https://e621.net/help/dtext) to [Markdown](https://www.markdownguide.org/getting-started/).

## Why Transition to Markdown?

### Familiarity

Users already know Markdown. Discord, GitHub, Reddit, and many other platforms use it. New users don't need to learn a bespoke syntax. Existing users face a short adjustment period, then they're using something they already know.

### Alignment

DText was created before the internet converged on a common rich text format. It has now. Markdown is the default expectation. Boorus often use BBCode, but outside that bubble, Markdown dominates.

### Maintenance

The Ragel-based DText parser is a maintenance burden. Difficult to build, difficult to integrate, and no one on the team wants to touch it. Replacing it is significant effort, but keeping it means a piece of infrastructure stuck in time.

## Basic Formatting

### Bold

`[b]text[/b]` maps to `**text**`. Standard Markdown.

### Italic

`[i]text[/i]` maps to `*text*`. Standard Markdown.

### Strikethrough

`[s]text[/s]` maps to `~~text~~`. [GFM](https://github.github.com/gfm/) standard.

### Underline

`[u]text[/u]` maps to `__text__`. Standard Markdown treats `__` as bold (alternative to `**`), but Discord uses it for underline. Discord's interpretation is more intuitive since bold already has `**`, and users are likely familiar with Discord's conventions.

### Superscript

`[sup]text[/sup]` stays as BBCode. No widely-adopted Markdown syntax exists. HTML `<sup>` is an option but mixing HTML into content is ugly and harder to write. Keeping BBCode for this, along with subscript and color, gives us a consistent set of familiar extensions.

#### Potential Alternative

Using `^text^` for superscript would be a natural decision, but it could cause problems. These could be alleviated by only recognizing this as a superscript tag when there are no newlines separating `^`s & maintaining the DText/BBCode tag.\n\nI'd also say that, for block elements in this style, mixing bare HTML tags into the input is no more ugly or hard to write than DText/BBCode, & is more intuitive to users familiar with HTML or any XML-derivative; it's just changing `[` to `<` & `]` to `>`.

### Subscript

`[sub]text[/sub]` stays as BBCode. Same reasoning as superscript.

### Spoiler

`[spoiler]text[/spoiler]` maps to `||text||`. Discord uses this syntax and users are familiar with it.

### Inline Code

`` `text` `` is already the same in DText and Markdown.

### Color

`[color=x]text[/color]` stays as BBCode. No Markdown equivalent exists. Keeping this alongside `[sup]` and `[sub]` means BBCode-style extensions are used consistently for features Markdown doesn't cover. Familiar to users who know BBCode from forums.

## Links

### URLs

Bare URLs work the same. `<url>` for special characters works the same.

`"title":url` maps to `[title](url)`. Different syntax, same result. Care needed with URLs containing parentheses or special characters during migration.

`"title":[url]` also maps to `[title](url)`. The bracket syntax was DText's way of handling special characters, which Markdown handles differently.

### Wikilinks

`[[page]]` and `[[page|title]]` stay as-is. Many Markdown flavors support this syntax (Obsidian, GitHub wikis). Common enough that we can adopt it directly.

### Anchor Links

`[[#anchor]]` maps to `[anchor](#anchor)`. Standard Markdown anchor link syntax.

`[[page#anchor]]` stays as wikilink syntax.

#### Potential Alternative

`[[#anchor]]` could also be supported directly, as we wouldn't allow any page to start with a `#` anyways, & minimizes the transitional burden & keeps it as small as the alternative.

### Tag Search

`{{tags}}` stays as-is. Site-specific syntax with no Markdown equivalent.

### Magic Links

`post #1234`, `pool #1234`, `topic #1234`, etc. stay as-is. They don't conflict with Markdown syntax.

### Thumbnails

`thumb #1234` stays as-is.

## Blocks

### Blockquote

`[quote]text[/quote]` maps to `> text`. Multiline content needs each line prefixed with `>`.

#### Potential Alternative

`[quote]text[/quote]` could additionally map to `>>>text>>>`. Adding a fenced blockquote in the style of fenced code blocks is an option to consider; it would be bespoke syntax, but follows preexisting conventions & preserves the convenience of the DText/BBCode tag for multiline content.

### Code Block

`[code]text[/code]` maps to triple backticks. Markdown also supports language hints for syntax highlighting, so we could decide to support that in the future.

### Headers

`h1.` through `h6.` map to `#` through `######`. Direct equivalents.

### Lists

`*` stays the same. DText uses `**` for nesting, Markdown uses indentation. Conversion needs to count asterisks and translate to indentation depth.

### Sections

`[section]`, `[section=Title]`, `[section,expanded=Title]` have no Markdown equivalent.

Options:

* HTML `<details><summary>Title</summary>content</details>` is portable but verbose and ugly to write
* Keep BBCode syntax, consistent with our other BBCode extensions
* Use pseudo-HTML that mimics the DText tag; e.g. `<section expanded title=Title>content</section>`
  * `<section>` is [already a real HTML tag](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/section), but you didn't know that either, & I doubt it's used anywhere, or will cause much confusion.

Keeping BBCode is probably better here. It's readable, users know it, and it fits with `[sup]`, `[sub]`, `[color]`.

### Tables

`[ltable]` pipe format is close to Markdown pipe tables. Needs a header separator row added (`|---|---|`).

`[table][tr][td]` BBCode format needs structural conversion to pipe tables.

#### Potential Alternative

Many Markdown parsers will render literal HTML tags, & the DText `[table]` tag & it's subtags already almost directly map to HTML; simply changing it to use HTML tags or converting `[]` to `<>`, sanitizing the input, & rendering it as HTML would work fine.

## Other

### Anchor Definitions

`[#name]` creates explicit jump targets. Markdown generates anchors automatically from headers. Explicit anchors are a DText-specific feature.

Worth investigating: how many wiki pages actually use explicit anchors meaningfully? If usage is low, this could be dropped. If not, keep as BBCode or convert to `<a id="name"></a>`.

#### Note

This has *heavy* usage in help pages; I wouldn't advise dropping support for this. I 100000% support auto-generating anchors from headers (want to add that regardless tbh), but I would recommend preserving explicit anchor creation.\n\nI'd also mention that current behavior is to convert to lowercase; this could cause interference if not preserved.

### Escaping

Escape syntax stays the same. DText does currently not fully support escaping with backslash everywhere, but this is likely a non-disruptive change.

## Parsing

Custom syntax like `[[wikilinks]]`, `{{tag search}}`, and `post #1234` needs to survive parsing. This rules out parsers without extension support.

The parser must output both HTML for rendering and DText for migration and conversion during transition. An AST-based parser makes this feasible: parse once, output to multiple formats.

[CommonMark.js](https://github.com/commonmark/commonmark.js) lacks a plugin API. Extensions require post-parse AST manipulation, which is awkward for adding new syntax. [markdown-it](https://github.com/markdown-it/markdown-it) has a proper plugin system and existing wikilinks implementations. Better fit for JS/TS.

Rails-side parser options need investigation if server-side parsing is required.

# Implementation

## Current state

* The client 
  * Accepts:
    * DText from the user
    * HTML from the server for rendering
    * Unprocessed DText from the server for the current values of rich text fields in the database
  * Performs
    * No processing on DText from the user before sending it to the server for database storage
    * No processing on DText from the server before using it to fill the input text field
    * No processing on HTML from the server before using it for rendering
  * Sends to the server:
    * Unprocessed DText input from the user for storing to rich text fields in the database
    * Unprocessed DText input from the user for rendering to HTML
* The server
  * Accepts:
    * Unprocessed DText from the client for rendering to HTML
    * Unprocessed DText from the client for storing to rich text fields in the database
  * Performs
    * A conversion from DText to HTML for rendering
    * No processing on DText for storing to rich text fields in the database
  * Sends
    * HTML to the client for rendering
    * Unprocessed DText to the client for the current values of rich text fields in the database

#### Use Cases

* Assigning a value to a rich text field on the server (e.g. creating a new comment)
  * Client receives DText input
  * Client sends DText to server
  * Server stores DText in field
* Retrieving the value of a rich text field from the server (e.g. the text of a comment the user wants to edit)
  * Server retrieves DText from field
  * Server sends DText to client
  * Client presents DText to user
* Rendering rich text to the user on demand (e.g. rendering a DText preview)
  * Client sends DText to the server
  * Server converts DText to HTML
  * Server sends HTML to the client
* Rendering rich text to the user (e.g. pre-rendering a comment on page load)
  * Server retrieves DText from field
  * Server converts DText to HTML
  * Server sends HTML to the client

## Initial Implementation

To get users comfortable with MD on e6 as early as possible, & to get feedback about how users feel about a full transition, the first step is to add a toggle to DText input elements that makes them treat the entirety of the entered text as Markdown instead of DText.\n\nBefore sending the input to the server (both for the rendered preview & submission), if set to Markdown, the input will be automatically converted to DText client-side before being sent to the server.\n\nThe server has no change in behavior; all changes occur client-side, & are only triggered when told the input is Markdown.

* The client
  * Accepts:
    * DText & Markdown from the user
    * HTML from the server for rendering
    * Unprocessed DText from the server for the current values of rich text fields in the database
  * Performs
    * No processing on DText from the user before sending it to the server for database storage
    * A conversion to DText on Markdown from the user before sending it to the server for database storage
    * No processing on DText from the server before using it to fill the input text field
    * No processing on HTML from the server before using it for rendering
  * Sends to the server:
    * Unprocessed DText input from the user for storing to rich text fields in the database
    * Unprocessed DText input from the user for rendering to HTML
* The server
  * Accepts:
    * Unprocessed DText from the client for rendering to HTML
    * Unprocessed DText from the client for storing to rich text fields in the database
  * Performs
    * A conversion from DText to HTML for rendering
    * No processing on DText for storing to rich text fields in the database
  * Sends
    * HTML to the client for rendering
    * Unprocessed DText to the client for the current values of rich text fields in the database

#### Use Cases

* Assigning a value to a rich text field on the server (e.g. creating a new comment)
  * Client receives DText or Markdown input
  * Client converts non-DText input to DText (Markdown → DText or DText → DText)
  * Client sends DText to server
  * Server stores DText in field
* Retrieving the value of a rich text field from the server (e.g. the text of a comment the user wants to edit)
  * Server retrieves DText from field
  * Server sends DText to client
  * Client presents DText to user
* Rendering rich text to the user on demand (e.g. rendering a DText preview)
  * Client sends DText to the server
  * Server converts DText to HTML
  * Server sends HTML to the client
* Rendering rich text to the user (e.g. pre-rendering a comment on page load)
  * Server retrieves DText from field
  * Server converts DText to HTML
  * Server sends HTML to the client

## Migration

### Transition Approach

Where does parsing happen?

**Client-side only**

The parser lives in JS/TS. The server stores Markdown and serves it raw. The client parses and renders HTML. Previews are fast since no server round-trip is needed. This might cause some layout shifts during page load.

The parser should be standalone enough so that the server could invoke it for migration or API conversion without needing a separate Rails implementation.

**Server-side only**

The parser lives in Rails. The server receives Markdown, parses it, and serves HTML. This is how DText works today. Previews require a round-trip.

Simpler overall as we can omit careful orchestration of calling the JS parser in rails.

**Both**

Parsers in both JS and Rails. Fast previews without round-trips and gradual frontend-end only adoption (server gets DText), then later, server handles rendering of Markdown → HTML and conversion of Markdown → DText for APIs during migration.

Two parsers to maintain. Both must handle our custom syntax identically.

### Database Migration

Not required to get things rolling, but desired to get rid of the Ragel DText parser.

If we later decide to store Markdown natively, the database can be converted piecemeal:

* Forum topics
* Forum replies
* Blips
* Comments
* Post descriptions
* Wiki articles

Beyond the database, the codebase contains hard-coded DText strings in source files and tools. These would also need conversion. To scope the work: scrape all string literals, run them through the DText parser, compare input and output. Any that differ contain DText. This gives a concrete count. These can be migrated gradually.

Migration requires a parser that can read DText and output Markdown. Options:

* Modify the Ragel parser to output Markdown instead of HTML. Tricky since Ragel outputs HTML directly, not AST.
* Use Ragel to output HTML, then convert HTML back to Markdown. Hacky and potentially lossy, but might be less effort.

If the Markdown parser lives in JS/TS, the migration script could invoke it directly. Unusual, but not impossible.

## Avenues to Explore

### Parsers/Transpilers

WebAssembly (WASM) [seems mature enough](https://caniuse.com/wasm), & there's options for both [compiling Ruby to WASM](https://github.com/ruby/ruby.wasm?tab=readme-ov-file#quick-example-how-to-package-your-ruby-application-as-a-wasi-application) & [running a Ruby interpreter in the browser](https://github.com/ruby/ruby.wasm?tab=readme-ov-file#quick-example-ruby-in-a-web-browser); we could make/use whatever DText/Markdown parser or DText → Markdown/Markdown → DText transpiler we want in Ruby & then simply compile it to WASM to instantly have our utility run on both the browser & the server. This would likely require being careful about dependencies, but it's an enticing option.

<https://github.com/salockhart/obsidian-bbcode> <https://obsidian.md/plugins?id=obsidian-bbcode>
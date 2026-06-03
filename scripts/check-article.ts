// Diagnostic: parse, render, oracle-compare, round-trip a single .dtext
// file. Used for iterating on regression fixes. Requires
// DMARK_ORACLE_URL set (start a long-lived container manually).
//
// Usage: npx tsx scripts/check-article.ts <path>

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseDText, parseDTextToAST, formatDText } from "@dmark/dtext";
import type { DocumentNode } from "../src/ast";
import { domEqual } from "../test/dom-equal";
import { astEqual } from "../test/md/ast-equal";

const ORACLE_URL = process.env.DMARK_ORACLE_URL;
if (!ORACLE_URL) {
  console.error("DMARK_ORACLE_URL not set");
  process.exit(2);
}

const target = process.argv[2];
if (!target) {
  console.error("usage: tsx scripts/check-article.ts <path>");
  process.exit(2);
}

async function main(): Promise<void> {
  const path = resolve(target);
  const dtext = readFileSync(path, "utf8");
  const opts = { allowColor: true, maxThumbs: 75 };

  const ast1 = parseDTextToAST(dtext, opts) as DocumentNode;
  const formatted = formatDText(ast1).output;
  const ast2 = parseDTextToAST(formatted, opts) as DocumentNode;
  const rt = astEqual(ast1, ast2);
  console.log(`round-trip: ${rt.equal ? "OK" : "DIFF"}`);
  if (!rt.equal) console.log(rt.diff?.slice(0, 800));

  const dmarkHtml = parseDText(dtext, {
    allowColor: opts.allowColor,
    maxThumbs: opts.maxThumbs,
  });

  const oracleRes = await fetch(`${ORACLE_URL}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      dtext,
      options: { allow_color: true, max_thumbs: 75 },
    }),
  }).then((r) => r.json() as Promise<{ html: string }>);

  const dom = domEqual(dmarkHtml, oracleRes.html);
  console.log(`oracle:     ${dom.equal ? "OK" : "DIFF"}`);
  if (!dom.equal) {
    console.log("\n--- dmark ---");
    console.log(dom.leftCanonical);
    console.log("\n--- oracle ---");
    console.log(dom.rightCanonical);
    console.log("\n--- diff ---");
    console.log(dom.diff);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

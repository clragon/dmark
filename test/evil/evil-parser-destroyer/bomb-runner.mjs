// Reads JSON {input} from stdin, parses with dmark, exits 0 on success.
import { convertDTextToHtml } from '../../../src/convert.ts';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  const { input } = JSON.parse(raw);
  convertDTextToHtml(input, { allowColor: true, maxThumbs: 75 });
  process.exit(0);
});

// Standalone smoke test for the dtext oracle container. Boots the same
// container the vitest globalSetup uses, hits /health, runs one render, and
// exits non-zero if anything looks off. CI runs this after `yarn test` as a
// sanity check that the oracle image still works outside the vitest harness.

import { renderViaOracle, oracleHealth } from '../test/oracle';
import { setup, teardown } from '../test/oracle-setup';

async function main(): Promise<void> {
  await setup();
  try {
    const health = await oracleHealth();
    if (!health.ok) {
      throw new Error(`oracle /health returned ok=false: ${JSON.stringify(health)}`);
    }
    console.log(`[smoke] oracle healthy, dtext ${health.dtext_version}`);

    const result = await renderViaOracle('[b]hi[/b]');
    if (result.error) {
      throw new Error(`oracle /render returned error: ${result.error}`);
    }
    if (!result.html.includes('hi')) {
      throw new Error(`oracle /render html missing expected content: ${result.html}`);
    }
    console.log(`[smoke] render ok: ${result.html}`);
  } finally {
    await teardown();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

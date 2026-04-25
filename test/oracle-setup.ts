// Vitest globalSetup: starts the dtext oracle container before any test runs,
// stops it after all tests finish. Exposes the container URL via
// DMARK_ORACLE_URL so test/oracle.ts can talk to it.
//
// Set DMARK_ORACLE_URL externally to skip container management entirely
// (useful when iterating against an already-running oracle).
//
// Uses testcontainers' Ryuk reaper, so containers are cleaned up even if
// the vitest process is killed mid-run.

import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

const IMAGE = 'dmark-oracle:dev';
const ORACLE_INTERNAL_PORT = 4567;
const HEALTH_TIMEOUT_MS = 30_000;

let started: StartedTestContainer | null = null;

export async function setup(): Promise<void> {
  if (process.env.DMARK_ORACLE_URL) {
    const res = await fetch(`${process.env.DMARK_ORACLE_URL}/health`).catch(
      (err: Error) => {
        throw new Error(
          `DMARK_ORACLE_URL=${process.env.DMARK_ORACLE_URL} but /health failed: ${err.message}`,
        );
      },
    );
    if (!res.ok) {
      throw new Error(
        `DMARK_ORACLE_URL=${process.env.DMARK_ORACLE_URL} but /health returned HTTP ${res.status}`,
      );
    }
    return;
  }

  started = await new GenericContainer(IMAGE)
    .withExposedPorts(ORACLE_INTERNAL_PORT)
    .withWaitStrategy(
      Wait.forHttp('/health', ORACLE_INTERNAL_PORT)
        .forStatusCode(200)
        .withStartupTimeout(HEALTH_TIMEOUT_MS),
    )
    .start();

  const host = started.getHost();
  const port = started.getMappedPort(ORACLE_INTERNAL_PORT);
  const url = `http://${host}:${port}`;
  process.env.DMARK_ORACLE_URL = url;

  const health = await fetch(`${url}/health`).then(
    (r) => r.json() as Promise<{ ok: boolean; dtext_version: string }>,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[oracle] dtext ${health.dtext_version} ready at ${url} (container ${started.getName()})`,
  );
}

export async function teardown(): Promise<void> {
  if (started) {
    await started.stop();
    started = null;
  }
}

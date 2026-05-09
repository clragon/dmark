// Adversarial fidelity probes. Each test asserts that the dmark dtext parser
// matches the ruby oracle byte-for-byte on a hand-crafted evil input. A
// failure here is a real divergence from the project's faithfulness invariant.
//
// Cases are split across multiple test files (probes-1.test.ts through
// probes-N.test.ts) so each vitest worker keeps a fresh oracle cache and
// the suite cannot be foiled by accumulated heap pressure. This file holds
// the initial slice; the remaining slices live in their siblings.

import { runSlice } from './run-slice';

runSlice(0);

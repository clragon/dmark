// Slice 3 of 3 (see probes.test.ts header). Each slice runs in its own
// vitest worker, so accumulated oracle-cache memory cannot collapse the
// whole suite into a single OOM.

import { runSlice } from './run-slice';

runSlice(2);

# Review Guide

Review priorities for `devagent-hub`:

1. Correctness
2. Regression risk
3. Contract drift
4. Test coverage
5. Docs parity

Blocking findings include:

- persistence or resume bugs
- approval, rejection, or repair-loop regressions
- stale-state or baseline-safety failures
- PR handoff behavior that can leave workflows stuck or inconsistent
- docs claiming validated behavior that tests or live runs do not prove

PR expectations:

- keep changes small and operator-safe
- include evidence for “live-validated” claims
- call out any workflow blast-radius or migration-safety impact

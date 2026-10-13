# Second live capture investigation: evidence boundary

Failed attempt: capture.wIPhsDTV, executable source 58975d91639e085f9d8057c7b363f36f2fdd9d71.

Owner-provided evidence: preflight-state present; fence-state absent; journal contains only
failure-refence, owned count zero, unverified count zero; five original replica specifications
remain one; all reported service versions 3487632; no backup process or accepted manifest.

Source control flow places this failure before fence-intent and therefore before any
controller service-update intent. TOOL_EXIT_FAILED can originate from four subprocesses in
probe(False): docker inspect of the permanent PG container, docker image inspect of the
client pin, docker ps -aq, or batch docker inspect of the returned container IDs.
Docker HTTP service checks have a different rejection code.

The attempted read-only Commander investigation timed out (MCP request timed out).
Current service equality and the exact historical subprocess are therefore NOT independently
verified. Do not call container churn the root cause without evidence.
No capture retry, scaling, SQL, deployment or recovery operation was executed.

The new standalone diagnostic changes no existing adapter or security gate. It holds the
existing attempt's advisory lock without writing it, compares saved/current service
specifications privately, and prints only permitted summary fields and subprocess categories.
It never prints raw Docker definitions, environment, command arguments or stderr.
A successful later probe cannot prove which subprocess failed historically.

## Owner SSH evidence collection

Use a fresh checkout of this diagnostic checkpoint. Keep the old pinned toolset and failed
attempt intact. In an authorised administrator SSH session:

```bash
sudo python3 "$DIAGNOSTIC_TOOLSET/scripts/cluster/dev-recovery/diagnose_prefence.py" \
  /opt/uvanoo-dev/backups/recovery/capture.wIPhsDTV
```

DIAGNOSTIC_TOOLSET must name the fresh checkout pinned to the published diagnostic commit,
not the original backup toolset. No key, backup, database or service command is needed.
Return the resulting summary, not raw private journals.

## Retry boundary

No retry is recommended yet. If the diagnostic finds a failure, retain its exact stage,
exit code and error class and correct only that demonstrated defect. If all probes pass,
the historical cause remains unproven; do not remove or relax checks to force a capture.
Any service mismatch requires private operator review before service restoration.
Do not use recover or scale merely because a failure-refence journal exists with zero ownership.

Existing passing backup validation 38399343438 is reused. New CI tests only the read-only
diagnostic and a newly created disposable missing-object fixture. That fixture demonstrates
classification of a possible list/inspect race, not the actual DEV cause.

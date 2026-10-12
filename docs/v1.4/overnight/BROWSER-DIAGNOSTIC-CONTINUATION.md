# Browser diagnostic continuation

Run 38318154918 passed trusted HTTPS startup and produced 12 real screenshots. Platform Super Admin, Cluster GM and Property Manager authenticated successfully; their People/Approvals navigation, Cluster GM profiles across both hotels, and mobile no-horizontal-overflow checks passed. Approver/Requester/Restricted logins failed; original harness omitted HTTP status. Two-stage setup timed out after Add stage; a first-run walkthrough is visible in the captured mobile DOM.

These are not classified as application defects without further evidence. The next harness revision records only auth HTTP status/error code/message (never successful auth bodies/tokens); it respects an actual HTTP 429 retry with a bounded delay and spaces login attempts. It dismisses an auto-start walkthrough through its existing Close tour button before interacting with obscured controls, and captures page errors and failure screenshots. No application, security or fixture permission change.

Dependent request/decision/export tests were not completed; they are not passes. Run 38318154918 and artifact 11777304370 remain unchanged. Full original report is browser-run-38318154918.json. Runtime is reused from the exact checksum-verified artifact; no repeat build/full release gate.

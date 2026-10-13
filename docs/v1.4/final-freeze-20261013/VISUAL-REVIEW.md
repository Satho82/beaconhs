# Visual freeze closure review — 13 October 2026

Both modules remain **ACCEPTED — FREEZE PENDING**. Owner acceptance dated 12 October is preserved. No product UI or functional workflow was changed.

## Evidence recovered

Exact product: `563fb0e9b79a838a5f394abaffb2f7dc743fc571`, tree `324c50a60e2cb0639ba920488a150c6531968374`.
The existing [browser index](../overnight/browser-evidence-index.json), original reports and committed [screenshots](../overnight/screenshots/) remain authoritative.

- Core authenticated browser run [38318803277](https://github.com/Satho82/beaconhs/actions/runs/38318803277): 35/35; six roles, two hotels, 30 screenshots. Artifact 11777954723 remains unexpired; ZIP SHA256 `5d1c96dfa2d043a0ebaca8c6cc07f7a4ad338b8823cf1801415bd115dca1593c`.
- Final focused run [38320812403](https://github.com/Satho82/beaconhs/actions/runs/38320812403): 6/6; mobile navigation and property reassignment/isolation/audit. Artifact 11778358853 remains unexpired; ZIP SHA256 `ce7b68ddda81d2a79cb79843334f2d267665698284fad18939ac9ed21cafe4cf`. Both artifacts expire 10 January 2027.
- Desktop navigation passed its two checks in 38319543537. Qualified financial entry passed its independent step in 38320245029. Both overall failed runs remain failed; their unrelated harness failures are preserved.
- Today, actual retained thumbnails were inspected again for Approvals reference, desktop People/Approvals, mobile People/Approvals, workflow configuration, approved request and corrected financial detail. These are recovered pixels, not a new browser run.
- Approvals original: `docs/v1.4/batch01/visual-checkpoint/references/Uvanoo Approvals Module Dashboard (1).png`, blob `c02632138e4f58703e57a84c8318b017b1eb715d`. It is a composite concept sheet, not a one-route screenshot specification.
- People originals located: “Uvanoo People Module UI Overview (1).png” (2,250,807 bytes) and “Uvanoo People Directory Dashboard(1).png” (1,399,914 bytes). A fresh read again returned OCR and image pointers, without inspectable pixels. **Original-pixel comparison NOT VERIFIED.**
- Written People specification recovered in full from “Pasted text(20261011-205513).txt”. It identifies design baseline `14eddbdf3bfa0e43fa4b50de10ba24940dadf6d0` and Option 2: left user table, right selected-user panel, Overview / Roles & Permissions / Properties / Activity tabs and Manage Permissions. This historical brief is evidence, not renewed authority for functional development.
- Bounded reference search and inspection of the People branch tree did not recover the exact Option 2 image. This is not proof it does not exist elsewhere.

## Comparison and exact limitations

| Area | Observed candidate | Reference / decision |
| --- | --- | --- |
| Shell and colours | Pale blue/light sidebar, navy icons/text, coral selected module, coloured module tiles | Consistent design language. Source CSS specifies sidebar gradient #f4f9fc → #e7f2f7, navy #103153 and coral #ff7165; platform primary default #0f766e. No claim of pixel-level colour sampling from the reference. |
| Branding and header | “Uvanoo Portal” text at upper left; Cycas Hospitality text near left of main header; search/user controls at right | Approvals concept shows Uvanoo logo and a navy header; written People brief requires Uvanoo logo upper left and tenant logo upper right. Exact release assets/configuration have not been demonstrated. Fixture/configuration gap, not sufficient evidence to patch runtime. |
| Navigation | Approvals has Dashboard, My Requests, Awaiting My Approval, Team Requests, Approval History, Reporting & Exports, Create Request, Workflow Configuration | Concept uses a different grouping including Categories, Suppliers and Settings. Current accepted multi-route workflow cannot be rearranged as an isolated cosmetic correction. Needs explicit visual mapping/disposition. |
| Layout | Approvals dashboard, detail, configuration and reports are separate pages | Reference combines submission, list, detail, manager decisions and explanatory cards into one sheet. No assertion that all panels belong on one production page. |
| People / Option 2 | Inspected directory is a table on desktop and cards on mobile; property assignment browser evidence is on the existing account administration route | Exact approved account split-panel comparison unresolved. Staff directory is not evidence that User Accounts Option 2 has been implemented or visually accepted. |
| Typography and spacing | Clear sans-serif headings; compact navigation/table typography; actual forms and detail pages recovered | No exact font/size/spacing specification recovered for all views. Font family equivalence and pixel geometry **NOT VERIFIED**. |
| Buttons | Teal People directory pill and active controls; coral module selection; navy Create Workflow button in captured configuration | Concept uses teal submission buttons. Different actions cannot establish a definitive same-control defect without approved mapping. No broad recolouring. |
| Tables | Searchable, bordered Approvals table and People directory; status badges; role-dependent content | Actual columns and data differ from illustrative reference. Empty job-title fields in synthetic People fixture are not proven rendering defects. |
| Forms | Multi-stage configuration; qualified financial regression shows supplier and description separately with GBP 125.01 | Earlier supplier/description concatenation was a selector error in the harness. Corrected financial screenshot supersedes it for field fidelity; no application correction required. |
| Responsive behaviour | At 390px, People uses cards; Approvals subnavigation wraps; module strip scrolls; two mobile navigation clicks passed | Functional responsive evidence passes its scoped checks. Exact mobile mock-up parity and other viewport sizes remain unverified. |

## Closure criteria

Obtain inspectable original People/Option 2 pixels and identify the approved release branding assets/configuration. Compare only the affected screens against those references, including exact typography and spacing requirements. If a verified isolated visual defect exists, correct it on an isolated branch with focused tests and new screenshots; preserve accepted workflows and protected runtime. Do not synthesize a replacement reference.

No passing full tests were repeated. There is no basis for an automatic visual PASS or either module being FROZEN.

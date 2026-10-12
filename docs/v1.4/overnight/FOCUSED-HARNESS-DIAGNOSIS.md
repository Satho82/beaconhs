# Focused harness diagnosis and final continuation

Preserved run 38319543537: three fixture logins and both desktop menu tests passed; mobile navigation and property reassignment did not finish. Failure screenshots inspected in run 38320084290.

Verified harness issues:
- Property assignment clicked the first listbox trigger, which is the scope-type selector. Screenshot failure-8-platform.png shows options such as Self/Tenant/Specific hotel properties, not hotel names. The corrected harness selects the second property listbox and waits for its option list.
- Mobile lookup used all nav elements immediately after opening an animated drawer. The failure capture shows the background dashboard/module strip after the click, not navigation to the expected route. The corrected harness waits for the actual role=dialog drawer and scopes navigation to its nav element. This is a harness correction; no claim of a proven runtime defect.
- Financial form helper used unqualified name selectors. Root metadata defines name=description before the form textarea. The corrected helper qualifies input/textarea/select, asserts each entered value, and verifies persisted supplier, description, amount and category separately. The earlier supplier/description screenshot is not accepted field-integrity evidence.

Continuation runs only failed mobile/property checks, necessary authentication setup, and one focused financial regression. Successful desktop and 35-check core evidence are preserved. Production build artifact reused with SHA256 verification. All accepted product bytes remain unchanged.

People original references are located in the owner's cloud files: Uvanoo People Module UI Overview (1).png and Uvanoo People Directory Dashboard(1).png. Read returned OCR and asset pointers, not inspectable pixels. People original-pixel comparison therefore remains NOT VERIFIED. The exact User Accounts Option 2 title was not resolved by the bounded title search; no substitute was declared approved.

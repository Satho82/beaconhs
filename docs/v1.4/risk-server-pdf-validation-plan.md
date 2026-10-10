# Risk Assessment PDF — governed server-side validation plan

**Status: prepared only. Local PDF export remains NOT VERIFIED.** This plan is
for a later governed server environment; it does not authorize deployment,
local Redis/MinIO repair, or worker startup.

## Preconditions

- Use an approved isolated test environment and synthetic tenant/property data.
- Confirm the web process and PDF worker use the same environment, queue name,
  Redis endpoint and object-storage bucket through protected configuration.
- Check Redis connectivity with a non-mutating PING and storage connectivity
  with the provider's authenticated bucket/head operation. Print only pass/fail,
  endpoint host (no credentials or query strings), and elapsed time.
- Confirm the worker reports ready and can consume a synthetic queue health job.
- Confirm the synthetic user's assessment is readable in its tenant/property
  scope; confirm a second tenant's assessment is denied.

## One synthetic export

1. Request the existing individual-assessment PDF endpoint as the authorized
   synthetic user, with a bounded timeout and no redirects.
2. Verify HTTP 200, `application/pdf`, `Cache-Control: no-store`, a `.pdf`
   attachment name, and a non-empty body with a valid `%PDF-` header and `%%EOF`.
3. Parse the PDF and verify assessment reference/title, property, hazard and
   control text, scores, corrective-action details, sign-off information, and
   historical snapshot content when the request selects a signed revision.
4. Verify dynamic Platform and current Tenant branding from the captured
   synthetic context. Confirm no branding or data from another tenant appears.
5. Repeat with a foreign assessment and require an explicit 403/404 with no
   PDF body and no object-storage artifact.
6. Confirm the PDF job and export audit entry are associated with the same
   authorized tenant and assessment. Remove only the generated synthetic test
   artifact using the environment's governed test-cleanup procedure.

## Completion record

Record each precondition and assertion as PASS/FAIL with elapsed time, worker
job ID, synthetic assessment reference, response content type, byte count, and
PDF parser result. Do not record passwords, bearer tokens, connection strings,
private preview markers, signed URLs, or raw environment variables. Visual
approval remains a separate human review even when the PDF parses correctly.

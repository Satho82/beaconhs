# Disposable browser startup diagnosis

Run 38316469229, job 115034175286, control b1a38c82e184a2497596dbf69a415cb41a03fc4e tested candidate 563fb0e9b79a838a5f394abaffb2f7dc743fc571.

Production build passed. The standalone process responded with application errors during login readiness: `[auth] APP_URL must use HTTPS in production.` Browser checks were skipped, not passed. Sanitized logs, readiness and source/hash evidence remain in artifact 11777472922; raw job result remains failed.

Verified cause: the disposable harness supplied HTTP APP_URL while NODE_ENV was production. packages/auth/src/public-origin.ts explicitly rejects that configuration. This is a working security guard, not a reason to change application authentication. The older failed attempt 38310507071 used the same HTTP configuration, but its missing server log means that historical cause remains an inference.

Correction is restricted to this review branch: ephemeral loopback TLS proxy with generated one-day CA/certificate, trust installed only in the hosted runner's Chrome NSS database; curl trusts this exact CA and Node uses NODE_EXTRA_CA_CERTS. APP_URL and BETTER_AUTH_URL are https://localhost:3443. No certificate-ignore flags, NODE_TLS_REJECT_UNAUTHORIZED override, production guard changes or app runtime changes.

Retry downloads successful runtime artifact 11777452571 from run 38316469229 and verifies ZIP SHA256 e06c24932c70792504d2e489f7ee439ce2f7ce51e289aee5f63282faed8c17d9 before extraction. No repeat build or full release tests. Disposable fixtures are recreated to isolate browser state. Original failed evidence is preserved.

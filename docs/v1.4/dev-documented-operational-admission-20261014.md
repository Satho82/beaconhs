# DEV documented operational admission

This is a narrowly scoped amendment to the existing `DEV_TEMPORARY_RECOVERY_V1`
admission class. It is not an admission record, deployment authorization, or
evidence that any live check has passed.

## Scope

The alternative is available only when the existing exact `dev.uvanoo.com`
target, maintenance hold, owner-approval byte pin, and all normal temporary
admission checks are present. Its maximum hold remains two hours. Production,
another environment, a different Compose identity, an expired hold, or a claim
of technical exclusion are rejected.

An approval may select:

```json
{
  "operationalEvidence": {
    "mode": "documented-operational",
    "independentAttestation": false,
    "sameHostRestore": true,
    "hostDisasterRecoveryVerified": false
  }
}
```

That selection must be paired with `maintenanceHold`, must omit the Ed25519
monitor public key, and causes the monitor envelope to have an empty signature
and the explicit `documented-operational` attestation type. It also requires the
receipt to record the same source and restore host hash plus a fresh isolated
PostgreSQL container and volume. It is therefore never an independent
cryptographic attestation or host-level disaster-recovery proof.

## Controls retained

No encrypted backup, checksum/decryption, restore catalog, ownership/privilege,
migration, MinIO, object-reference, cross-store, Collabora/WOPI, legacy-isolation,
authentication, watchdog, no-writer window, audit trail, owner approval or
nine-object storage exception check is waived. The same-host restore must use a
fresh independent container and volume; every observation remains fresh and the
monitor still latches stopped on a failed probe. The hold replaces only the
technical writer-exclusion claim with a truthful coordinated-operator claim.

## Residual risk

Same-host restoration proves only that the encrypted backup can be decrypted and
restored into the isolated PostgreSQL container/volume on this VPS. It does not
prove host-level disaster recovery. Privileged root, Docker, and Dokploy operators
can alter operational evidence or act between observations. The owner must accept
that risk for the bounded DEV window; this amendment never labels it technical
exclusion or permits it for production.

# ArcSpro secret rotation runbook

Use this runbook after a credential has appeared in a tracked file or Git history. Never paste a secret, decrypted PII, or full database URL into the issue, commit, terminal transcript, or evidence bundle.

## Current incident scope

The repository previously tracked `server/.env.dev`. The file named OCR/API credentials, JWT and database credentials, and PII encryption/HMAC keys. Removing the file from the current tree stops new clones from receiving it, but does not revoke credentials or remove earlier Git objects.

Treat every non-placeholder value that was present in that file as exposed. The affected history begins at commit `1b46a2d`; verify the final remote scope before rewriting history.

## Rotation record

Create one restricted incident record and fill this table without values:

| Credential family | Owner | Provider/account | Revoked at | Replacement deployed at | Evidence link | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DashScope / reimbursement OCR | Platform operations | Record account only |  |  |  | pending |
| JWT signing | Backend owner | ArcSpro API |  |  |  | pending |
| PostgreSQL application user | Database owner | Production PostgreSQL |  |  |  | pending |
| Assessment encryption/session/pepper | Assessment owner | ArcSpro API |  |  |  | pending |
| PII encryption and HMAC | Security + database owner | ArcSpro API/worker |  |  |  | pending |

Acceptable evidence is a provider rotation event ID, deployment ID, database role-change audit row, or redacted command result. A screenshot containing a credential is not acceptable evidence.

## Immediate containment

1. Restrict repository and build-log access until provider credentials are revoked.
2. Revoke and replace `DASHSCOPE_API_KEY` and `REIMBURSEMENT_OCR_API_KEY` in the provider console.
3. Replace `JWT_SECRET`, assessment keys, and the PostgreSQL password in the secret manager. Update app, worker, backup jobs, and operational clients in one coordinated window.
4. Invalidate active sessions after the JWT replacement. Verify that an old token is rejected and a newly issued token succeeds.
5. Run `node scripts/check-tracked-secrets.mjs` on the prepared release commit.

## PII key rotation: V1 to V2

Do not overwrite V1 in place. Ciphertext records include their key version, so V1 must remain available while old rows are read.

The current code selects versioned keys in `server/src/utils/crypto.js`. `server/src/utils/key-guard.js` fingerprints both active encryption and HMAC keys, rejects same-version drift, and re-encrypts a successfully verified older canary before that old key is retired. Verify that this behavior is present in the deployed release before changing `PII_ACTIVE_KEY_VERSION`.

1. Take and verify a restorable PostgreSQL backup. Record row counts for encrypted `records` and `lottery_lists` fields.
2. Generate independent 32-byte encryption and HMAC keys outside the repository. Store them as `PII_ENCRYPTION_KEY_V2` and `PII_HMAC_KEY_V2` in the secret manager.
3. Deploy app and worker with V1 and V2 present while `PII_ACTIVE_KEY_VERSION=v1`. Verify readiness and decrypt samples through normal APIs.
4. Set `PII_ACTIVE_KEY_VERSION=v2` for app and worker together. Verify the key guard reports a V1-to-V2 canary migration, and verify new writes have an `enc:v1:v2:` prefix and remain readable.
5. Run the approved re-encryption job in bounded batches. For each row: decrypt with the ciphertext version, encrypt with V2 using the same AAD context, and recompute blind indexes with the V2 HMAC key.
6. Compare row counts, null counts, decryption failures, blind-index lookup results, and canary status. Roll back from the verified backup on any mismatch.
7. Keep V1 available for the agreed observation window. Remove V1 only after a full scan finds no V1 ciphertext and no V1 blind-index dependency.

## Git history cleanup

Rewrite history only after all exposed credentials are revoked. Coordinate a maintenance window for every remote, including GitHub and Gitee mirrors.

1. Freeze pushes and record all protected branches and tags.
2. Use `git filter-repo` to remove `server/.env.dev` from every ref in a disposable mirror.
3. Verify `git log --all -- server/.env.dev` and an object-content scan return no matches.
4. Force-update approved refs, invalidate caches where supported, and require every contributor and deployment checkout to reclone.
5. Re-enable pushes only after remote readback and a clean clone both pass `node scripts/check-tracked-secrets.mjs`.

## Completion criteria

- Current and clean-clone scans pass without exceptions.
- Every credential family has revocation and replacement evidence.
- Old JWTs fail and new JWTs succeed.
- App, worker, backup, and readiness checks use the replacement database/JWT/PII configuration.
- No V1 ciphertext remains before V1 retirement.
- Every remote and deployment checkout has been verified after history cleanup.

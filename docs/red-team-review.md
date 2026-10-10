# Evidence Atlas red-team review

Reviewed 2026-10-10 against commit `a70db5f`. Repairs landed in commit `0aeb073`.

## Verdict

**Do not connect Evidence Atlas to real company knowledge yet.** The pilot was candid about most of its boundaries, but the original code had defects in the places that matter once data is real:

- Saved runs leaked restricted record IDs between personas and after revocation.
- Change-impact answers silently dropped dependents and could start from the wrong object.
- Approval ignored changed relationships.
- Retirement erased decision history.
- A full audit log blocked revocation.

Each defect was reproduced with a test written before execution. On the original code, 19 of 30 adversarial engine cases and 4 of 6 adapter cases failed.

All 13 confirmed pilot defects are repaired. Unit tests, route checks against local Workers + D1, and headless-browser checks verify the repairs. What remains are production blockers, listed under [Open improvements](#open-improvements).

## Findings

Ordered by consequence. Rows 1–13 are confirmed pilot defects and are repaired. Rows 14–20 are not fixed in the pilot.

| # | Finding | Class | Severity | Where | Reproduction or evidence | Consequence | Repair | Verified by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Saved runs exposed record IDs the viewer cannot read | Confirmed defect | High | `lib/atlas-engine.ts` `runVisible`, `viewState` | An engineer or steward graph run on "What is affected if fct_shift_demand changes?" put `d_quality` and `dec_yield` in the analyst's GET payload. Revoking a non-cited `dbt_cycle` left it in the run. | Restricted IDs and titles reach the browser and every export. Visibility checked only cited records. | `projectRun` reauthorizes every non-cited reference per viewer: context, impact, candidates, relation versions | Exhaustive case (3 creators × 7 questions × 3 viewers); route check; in-app check |
| 2 | Impact on a saved run silently dropped dependents | Confirmed defect | High | `retrieve`: impact filtered to citations | The same question reported `m_takt`, `dbt_takt`, `a_build` and omitted `a_capacity`. The in-app "Directed change impact" check claimed `a_capacity` is reached. | Change answers understate blast radius with no warning | Full directed traversal, plus `complete` and `limits` (access scope, hop limit, stale relationships) | 4 graph-completeness cases; route check |
| 3 | Approval ignored changed relationships | Confirmed defect | High | `transitionRun`; run manifest | Revising `a_capacity` after a proposal still allowed approval. `a_capacity` supports `a_capacity CONSUMES m_takt` but is not cited. | An impact claim is approved after its basis changed | Runs capture relation versions, ranked candidates, and config. Approval is refused on any change. Legacy graph runs must rerun. | 3 decision-integrity cases; in-app check |
| 4 | A full audit log blocked revocation, retirement, deletion | Confirmed defect | High | `addAudit` threw after the mutation | In a seeded 5,000-event workspace, POST revoke returned 400 | Access cannot be withdrawn | Access changes exempt from audit capacity and idempotent (at most 3 events per record) | 2 persistence cases; route check returns 200 |
| 5 | Snapshot outgrows D1's row limit before the app's caps | Confirmed defect | High (hosted) | `app/api/workspace/route.ts` whole-snapshot `UPDATE` | 250 typical runs = 1.51 MB; with maximum-length notes, 6.66 MB. D1 caps a row at 2,000,000 bytes. Local D1 stored 2,044,475 bytes, so the emulator does not enforce it. | Once the row is full, hosted writes fail, including revocation | 1.8 MB budget for growth; access changes keep headroom; clear error above 2 MB | Unit case; route check refuses growth at 1.96 MB while revoke succeeds |
| 6 | Impact started from the top keyword match | Confirmed defect | Medium | `retrieve` used `roots[0]` | "Does a takt time definition change affect the Build overview dashboard?" rooted at the consumer `a_build` and reported no impact | Confident wrong "nothing affected" | Inferred root disclosed with alternatives; explicit `impactRoot` checked for access, with the same error for hidden and missing records | 3 cases; browser check of "Recompute from" |
| 7 | Retirement hid decision history for every persona | Confirmed defect | Medium | `runVisible` required approved status | Retiring `dec_calendar` made a proposed run vanish, even for the steward | The decision trail disappears with no confidentiality gain, since the retired record stays readable | Visibility by access only; stale-evidence flag; approval refused and the button disabled | Lifecycle case; browser check |
| 8 | Deletion left graph references and relationships | Confirmed defect | Medium | `mutateRecord` delete | Deleting context-only `dbt_cycle` left it in run `graphIds` and in `edges` | A deleted object's ID and relations persist and export | `scrubReferences` across edges, index, runs, and manifests; schema-1 workspaces scrubbed on upgrade | Lifecycle and upgrade cases; in-app check |
| 9 | BigQuery adapter abandoned running jobs | Confirmed defect (scaffold) | Medium | `production/bigquery-provider.ts` `vectorSearch` | `timeoutMs` bounds only the client wait. There was no `jobs.cancel` and no `jobTimeoutMs`. | Billable jobs keep running after a timeout | `jobTimeoutMs` of 15 s, plus best-effort cancel on any failure after the job is created | 5 mocked cases, 3 of them failing on the original code |
| 10 | Underfilled top-k returned silently | Confirmed defect (scaffold) | Medium | Adapter join; vector index DDL | Post-filters can return fewer than top_k, even zero. The index had no `STORING` columns. | Recall loss looks like a complete answer | Report `requestedTopK` and `underfilled`; add `STORING`; document the RLS caveat (row 18) | Mocked case; SQL comment cites docs |
| 11 | Identical re-publication created a revision | Confirmed defect | Low | Route `revise` | Publishing unchanged text added version 2 and invalidated the `d_takt` relations | Needless approval and graph invalidation | Refuse an identical hash; logic moved to the engine's `reviseRecord` | Lifecycle case |
| 12 | Storage faults returned 400 with raw messages | Confirmed defect | Low | Route `POST` catch | Any thrown error became a 400 with its message | Internal errors shown to users; retryable faults look like user errors | `AtlasError` for domain messages; everything else returns a generic 503 | Typecheck; route checks |
| 13 | UI overstated some capabilities and hid controls from assistive technology | Confirmed defect | Low | `Atlas.tsx`, `Graph.tsx`, CSS | Labels read "Grounded extracts" and "replayable context". SVG `role=img` hid the node buttons. The mobile submit had no accessible name. 62 of 99 mobile text elements were under 10 px. Lint had an error. | Misleading labels; inaccessible controls | Accurate labels, matched terms shown, `role=group`, `aria-label`, mobile type raised (41 of 99 remain under 10 px), `Link` | Lint clean; headless Chromium at 1440 and 390 px |
| 14 | Persona comes from the request body; one person proposes and approves | Production blocker | Critical | Route input `role`; `transitionRun` | By design in the pilot | No real authorization or separation of duties | Server-verified SSO subject, groups, and entitlements; an approver distinct from the proposer | Not testable without corporate identity |
| 15 | Lexical retrieval answers irrelevant questions | Confirmed limitation, not fixed | Medium | `retrieve` scoring | "What time is lunch?" returns 10 extracts and a downstream impact | Plausible but unrelated evidence | Labeled questions, hybrid ranking, and a measured abstention threshold | Recorded as a `todo` case; matched terms now visible |
| 16 | Revocation versus content already delivered | Production blocker | High | GET path; browser state; exports | A GET loaded before a revocation commits returns the old view. Open tabs keep content until refresh. | Revoked content stays on screens and in exports | A revocation latency target, short-lived views, and export controls. The pilot now refreshes after a 409. | Route checks cover compare-and-swap only |
| 17 | JSON snapshot store | Architectural tradeoff | High for production | `atlas_workspaces.state` | Every write rewrites the whole document. 6 parallel writes give 1 success and 5 conflicts. | One writer per workspace; no immutable audit; erasure depends on D1 Time Travel (30 days on paid plans) | Normalized tables plus append-only decision events | Route check |
| 18 | Required RLS defeats vector pre-filters | Architectural tradeoff | High for BigQuery serving | `chunks` table plus the RLS prerequisite | BigQuery ignores stored columns on tables with row access policies, so filters become post-filters | Underfill grows with permission selectivity | Measure underfill per permission profile; over-fetch or brute-force | Docs only; needs live BigQuery |
| 19 | Impact relations have one direction for all change types | Architectural tradeoff | Medium | `CONFIG.impactRelations` | For `m_takt IMPLEMENTED_BY dbt_takt`, a definition change to `m_takt` does not flag `dbt_takt`. A retired intermediate breaks a chain without a flag. Edges added after a run are not detected at approval. | "Impact" means data consumers only | Change-type semantics per relation; flag retired intermediates | Documented, not fixed |
| 20 | Static files and identity headers on the host | Unverified risk | Medium | `public/`; `app/chatgpt-auth.ts` | Identity rests on platform-injected headers. Whether the host strips client-supplied copies is unknown. | Spoofing if headers are not stripped | Confirm the platform behavior | Not testable from here |

## Repairs and test results

| Check | Original (`a70db5f`) | Repaired (`0aeb073`) |
| --- | --- | --- |
| Original Node tests | 14 pass | 14 pass (fixture count updated to 16) |
| Adversarial engine suite, `tests/redteam.test.ts` | 30 cases: 9 pass, 19 fail, 1 todo, 1 skip | 31 cases: 29 pass, 0 fail, 1 todo, 1 skip |
| Adversarial adapter cases | 6 cases: 2 pass, 4 fail | 6 pass |
| Full suite | Not applicable | 51 tests: 49 pass, 0 fail, 1 todo, 1 skip |
| In-app evaluation | 12 of 12 | 16 of 16 (positive control added to "Restricted content") |
| `tsc --noEmit`, `pnpm build` | Pass | Pass |
| `pnpm lint` | 1 error, 2 warnings | Clean |
| Analyst payload after a steward impact run (local Workers + D1) | Leaks `d_quality`, `dec_yield` | No restricted IDs |
| Revoke with 5,000 audit events | 400 | 200 |
| New run at 1.96 MB | 200, then grows past 2 MB | Refused with a clear message; revoke still 200 |
| Tenant isolation, CSRF origin, missing identity | 400, 403, 401 | Same |
| Headless Chromium, 1440 and 390 px | Not run | No console errors, no horizontal overflow |

- The `todo` case is the irrelevant-question limitation (row 15).
- The `skip` case is vector recall, which the pilot cannot measure.
- One expectation was corrected after its first run. It treated graph-context citations as ranked alternatives; it now checks the ranked candidate list.

**Behavior change for existing workspaces.** Graph-mode proposals saved before these repairs have no relationship versions, so approving one requires a rerun. Existing snapshots upgrade in memory on read and persist on the next write. No stored records, runs, or decisions are dropped.

## Open improvements

Each of these is absent from the pilot by design, not by defect. All must hold before real evidence enters the system.

- [ ] **Identity and separation of duties.** Replace the request-body persona with a server-verified SSO subject, groups, entitlements, and policy epoch. The approver must differ from the proposer and hold authority for the decision's scope.
- [ ] **Source ACL synchronization with a revocation target.** Agree a maximum revocation latency with the owners. Fail closed when entitlement data is older than that. Cover in-flight requests, open browser tabs, exports, and caches.
- [ ] **A transactional decision store.** Replace the JSON snapshot with normalized evidence, run, and approval tables plus append-only decision events. Define erasure to include backups and point-in-time recovery.
- [ ] **Ingestion lifecycle.** Source event IDs, per-object ordering, duplicate and out-of-order handling, missed-deletion reconciliation, and restore with tombstones exist only as handoff proposals.
- [ ] **Retrieval relevance.** A held-out set of labeled questions must show evidence recall and abstention before any answer reaches a decision.
- [ ] **Graph semantics.** Relations need change-type meaning, because a definition change and a data change propagate differently. Retired intermediates and edges added after a run must be flagged.
- [ ] **BigQuery serving evidence.** Measure delegated per-user credentials, RLS on every referenced table, underfill under real permission profiles, latency, and cost. Read `vectorSearchStatistics` and billing from `jobs.get`, because the polled response omits bytes billed.
- [ ] **Hosted platform checks.** Confirm that the host strips client-supplied `oai-authenticated-*` headers. Confirm that D1 enforces the 2 MB row limit and what its Time Travel retains.

## Architecture recommendation

**Keep BigQuery and Cloud Storage as the governed evidence store. Add a transactional PostgreSQL-family store for decisions now. Let measurement decide where retrieval is served.** Use BigQuery serving for a measurement spike only, and move it when a trigger below fires.

Three separations make the choice smaller than it looks:

- **Evidence authority stays in source systems.** BigQuery holds governed copies, revisions, tombstones, and decision analytics. That does not change with the serving engine.
- **Graph modeling is not graph storage.** The model is an edges table keyed to evidence revisions, which the schema already has. At six hops, recursive SQL in PostgreSQL or BigQuery Graph can traverse it. A dedicated graph database needs a measured reason. BigQuery GQL requires an Enterprise or Enterprise Plus reservation; on-demand projects get `GRAPH_EXPAND` only.
- **Vector retrieval ranks; it never authorizes.** Every candidate is rechecked against current evidence revisions and entitlements before display, whichever engine ranked it.

| Option | Strong at | Weak at | Move to it when, measured |
| --- | --- | --- | --- |
| BigQuery-first serving | Already in the stack; one governed copy; per-user delegated identity; batch embedding and evaluation | Job-based request path; cost per query in bytes or slots; no index under 10 MB; stored-column pre-filters ignored under RLS, so selective permissions underfill; GQL needs a reservation | Default for the spike. Keep it only if p95 retrieval, concurrency, underfill, and cost meet owner-set targets under real RLS profiles |
| AlloyDB or PostgreSQL projection | Millisecond reads; transactions for workflow state; lexical, vector, and recursive graph queries in one engine | A second copy to sync and reconcile; row security enforced from app-set session context, not per-user database identity | Needed now for workflow state. Use it for serving too when BigQuery misses the latency, concurrency, underfill, or cost target |
| Dedicated vector service | Nearest-neighbour search at large scale and high query rates | Permissions replicated as filter tokens; a third copy to keep in sync; vendor approval | Only after the PostgreSQL projection fails a measured recall and latency target at real corpus size |
| Selective live federation | Freshest state; source ACLs enforced at the source | Answers inherit source latency and outages; no ranking; load on operational systems | Only for current operational state whose freshness target is shorter than the ingestion interval; read-only, under the user's identity |

Set every threshold with the owning team before the spike. The pilot supplies none, and synthetic numbers must not stand in for them.

## Not verified

These areas are untested. Claims above that depend on them rest on primary documentation checked on 2026-10-10.

- **Hosted platform:** header stripping, owner-private access to static files, D1's row-limit enforcement, and Time Travel retention.
- **The deployed workspace:** the upgrade path was tested on synthetic schema-1 snapshots only.
- **Live BigQuery:** no SQL was executed. If the first `jobs.query` response is lost, the job ID is unknown and only `jobTimeoutMs` bounds the job.
- **Real data and load:** relevance on real questions, ACL mapping, concurrency beyond six simultaneous local writes, and Worker CPU time for a 2 MB snapshot serialized on every write.
- **Accessibility depth:** no screen reader or physical device was used.

## Next actions

1. **Replace the persona selector before any real record loads.** Server-verified identity and a distinct approver close the only Critical finding. Rerun any open graph-mode proposals after deploying these repairs.
2. **Stand up the decision store.** Build normalized run, approval, and outcome tables with append-only events in Cloud SQL or AlloyDB. Add an erasure policy that names backups and point-in-time recovery.
3. **Run a two-week BigQuery measurement spike under real RLS.** Use 30 to 50 owner-labeled questions across at least three permission profiles. Record evidence recall, abstention, underfill, retrieval p50 and p95, bytes billed, and revocation latency; those numbers choose the serving tier.

## Sources

- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [BigQuery vector indexes](https://docs.cloud.google.com/bigquery/docs/vector-index)
- [BigQuery Graph overview](https://docs.cloud.google.com/bigquery/docs/graph-overview)
- [BigQuery release notes](https://docs.cloud.google.com/bigquery/docs/release-notes)
- [BigQuery REST discovery document, revision 20260922](https://bigquery.googleapis.com/discovery/v1/apis/bigquery/v2/rest) (`jobs.query`, `jobs.getQueryResults`, `jobs.cancel`)

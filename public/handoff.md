# Evidence Atlas — work-environment handoff

Continue this working synthetic pilot inside Relativity's approved development environment. Preserve its source inspection, constellation graph, decision history, and lifecycle tests. Do not treat its fixture records as real company definitions or its demo personas as production authorization.

## Objective
Implement Pattern B using the existing GCP stack: original source systems own business authority; Cloud Storage and BigQuery retain policy-approved evidence; keyword/vector/graph retrieval are replaceable projections; transactional workflow state owns approvals; BigQuery holds analytical decision history. Expose through Dreamcatcher and Bifrost.

## What already works
- Private app authentication and per-user persistent D1 workspace state, with compare-and-swap revisions to prevent lost updates.
- 22 synthetic evidence objects; exact source revisions, SHA-256 hashes and spans.
- Keyword retrieval, alias expansion, permission-filtered graph traversal, directed dependency impact function.
- Provisional-claim exclusion, revision inspection, source revision publication, access restriction, retirement, deletion, and rebuild.
- Tombstones prevent resurrection; deletion scrubs dependent answer text; historical runs are reauthorized on read.
- Investigation → proposal → steward approval/rejection → recorded outcome. No operational actions.
- 12-case in-app evaluation fixture and Node tests for lifecycle, stale approvals, role checks, and the BigQuery adapter.
- A server-side BigQuery vector query adapter in production/bigquery-provider.ts, tested using mocked REST responses. It is not connected to live GCP.

## Discover first; do not guess names
1. Inspect existing repositories, environment configuration, approved services, and dbt manifest/catalog/run-results artifacts. Read local AGENTS.md and deployment instructions.
2. Identify the dev GCP project, region, billing model, reservation edition, and approved BigQuery datasets. Run only bounded read-only discovery using sql/discovery.sql after substitution.
3. Find actual certification status models, metric definitions, lineage artifacts, dashboard inventories, Dreamcatcher app registry, and OpenMetadata endpoints. Identify owners and approved versions.
4. Produce docs/source-map.md: logical entity, physical table/API, primary key, grain, revision/effectivity, authoritative fields, permission method, deletion method, freshness contract, owner, and unknowns. Do not manufacture missing tables.
5. Start with three real questions: approved metric definition; downstream consumers and change impact; decision rationale and evidence. Confirm expected answers with a domain owner.

## Replace the pilot boundary
- Keep the UI contracts, but replace /api/workspace's synthetic snapshot loading with a repository/provider layer. The current D1 JSON snapshot is deliberately a bounded pilot store (250 runs, 5,000 audit events), not the production warehouse design.
- Use sql/bigquery-foundation.sql as a schema proposal, not an instruction to create duplicate objects. Reuse existing authoritative models and catalog IDs.
- Map source ACLs explicitly. Replace selectable role personas with server-verified SSO subject, groups, attributes, policy epoch, and source entitlements. Identity and permission data must not come from user-supplied JSON.
- Wire BigQueryProvider only after a trusted server-side getSession resolver supplies delegated credentials for the effective user and source-equivalent RLS has been verified on every referenced table. A shared privileged service account plus a subject string does not reproduce per-user authorization.
- No GCP tokens, service-account keys, raw source ACLs, or unrestricted corpus in client bundles. Keep embedding generation and vector search server-side. Use approved regional endpoints.
- The adapter binds query values, validates identifiers and dimensions, caps top-k and bytes billed, disables query-result caching, polls bounded jobs, and rejects incomplete pages. It returns job IDs for usage inspection. It is a starter; add cancellation, workload budgets, and observability appropriate to your environment.
- The SQL adapter excludes tombstones and joins candidates against current source revisions. Selective filtering may reduce recall or index use. Measure this with real policies; do not loosen access controls to improve recall.

## Ingestion and knowledge lifecycle
Use source-specific connectors with durable checkpoints, immutable source event IDs, per-object revision ordering, idempotent ingestion, and periodic full reconciliation. ACL changes and deletion events have priority over normal indexing. A content hash does not replace source sequence/version ordering. Keep authoritative revocation decisions on a query-time path; define maximum tolerated revocation latency and fail closed when entitlement freshness exceeds it.

Records require stable namespaced IDs, source and source revision, valid time and observed time, content hash, parser/chunker/model versions, source pointers and exact spans, classification, policy version, and retention state. Relationships require evidence ID AND evidence revision. Revalidate relations when supporting evidence changes. Persist entity-resolution decisions and reversible merges.

Treat retirement, revocation, hold, and erasure separately. Purge derived summaries, embeddings, cached answers, and copied content according to policy. Retained audit metadata and backups require an explicit policy; the demo's deletion tests do not prove physical erasure from backups or devices that already downloaded data. Rebuilds must consult tombstones and current authorization. Hold retention does not automatically authorize ordinary retrieval.

## Retrieval and graph
Build a common provider contract returning evidence ID, source revision, span, hash, score method, source URI, retrieval time, policy epoch, and query job ID. Route exact lookups to SQL, lexical retrieval to keyword indexes, semantic retrieval to approved embeddings, graph traversal to explicit relationships, and current operational state to live authorized reads.

The synthetic app performs no semantic vector search, reranking, or LLM generation. Do not relabel lexical scores as semantic similarity. Add a real embedding provider and evaluation baseline before enabling a vector mode. Core BigQuery Graph reached GA August 31, 2026; verify reservation and feature requirements in the target environment. Use ISO GQL/SQL-PGQ terminology; BigQuery vector indexes are IVF or TreeAH.

When adding an LLM, retrieved documents are untrusted data, not tool instructions. Authorize content before it reaches the model. Tools must remain separately authorized. Keep generated explanations distinct from quoted evidence; unsupported assertions must abstain. Candidate extracted claims can be stored as provisional; publishing accepted domain claims needs the chosen review policy, not blanket manual approval of every deterministic row.

## Decision loop
Preserve run identity, evidence snapshot, graph relation versions, retrieval/model/prompt/config/simulation versions, uncertainty, rejected alternatives, approval actor and scope, execution receipts (future), and outcome linkage. Keep operational workflow state in an approved transactional system. No writes to ERP, MES, PLM, QMS, machine controls, or production configuration in this pilot. Approval of a recommendation is not approval to execute arbitrary tools.

## Acceptance gates
- Held-out domain questions with expected evidence and correct revisions; compare SQL/keyword, vector, reranking, and graph modes on the same corpus.
- Denied evidence never reaches the model or user, including titles, graph edges, summaries, exports, history, caches, or debug logs. Evaluate multiple permission profiles and revocation during a request.
- Source updates and out-of-order events; missed deletion followed by reconciliation; failed extraction; re-embedding; restore/rebuild with tombstones; entity merge reversal; source outage; prompt injection; stale approval.
- Record retrieval p50/p95 separately from full-answer latency, concurrency, index usage/coverage, bytes billed or slot consumption, parsing/embedding/model charges, time to revoke, and investigation time saved. Set targets with owners; do not inherit invented subsecond promises.
- Measure ANN recall against brute force AND answer evidence recall against domain labels. Small (<10 MB) BigQuery tables will not populate vector indexes.
- Preserve a measured cost model and a rollback plan. Add AlloyDB or a separate graph store only if the pilot establishes a need.

## Implementation order
1. Source map, identity/permission contract, and dev configuration.
2. One bounded real corpus with evidence versioning and deletion/ACL synchronization.
3. Exact/keyword baseline with verified citations.
4. Vector retrieval and graph comparison under the same identity.
5. Decision run persistence and Dreamcatcher/Bifrost integration.
6. Operational evaluation, owner review, and launch recommendation.

Return concrete changes, commands, test results, remaining blockers, and an updated architecture decision. Do not claim live connections or passing production evaluations without executing them.

## Primary references (checked October 10, 2026)
- https://docs.cloud.google.com/bigquery/docs/vector-index
- https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/search_functions
- https://docs.cloud.google.com/bigquery/docs/graph-overview
- https://docs.cloud.google.com/bigquery/docs/release-notes
- https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query
- https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/jobs/getQueryResults

# Evidence Atlas

A working, private knowledge and decision-loop pilot for Relativity's data architecture initiative. All bundled records are synthetic. No Relativity data, GCP credentials, or company systems are connected.

## Features
Explore keyword/alias retrieval and graph context; inspect source revisions and SHA-256 citations; test access restrictions, retirement, deletion and rebuild; record proposal/approval/outcome history; run an isolated 12-case evaluation suite; export investigations and source. The initial scenario follows metric definitions through dbt implementations to Dreamcatcher/Power BI/Grafana consumers, with a small engineering-only test/lot example.

## Runtime
React 19 + TypeScript on the supplied Vinext/Cloudflare runtime. Cloudflare D1 persists an owner-scoped synthetic workspace with optimistic concurrency. Hosted access is owner-private; every API operation also requires platform-authenticated identity. Demo personas alter fixture permissions only. They are not an authorization system for real corporate data.

## Setup and verification
Node >=22.13 (Node 24 recommended), pnpm 11.

```sh
pnpm install --frozen-lockfile
node --experimental-strip-types --test tests/*.test.ts
pnpm exec tsc --noEmit
pnpm build
```

The Sites helper configures hosted resources from `.openai/hosting.json`; `d1` is `DB`. Schema migrations are committed in `drizzle/`. Local preview requires applying migrations to local D1 and the platform-supported authenticated preview path. Do not add a production identity bypass to make local testing easier. For a work-environment deployment, replace the platform auth and D1 repository boundary with approved corporate equivalents; the rest of the app is ordinary React/TypeScript and portable pure logic.

## Repository map
- `app/components/`: explorer, SVG graph, evidence inspector, decision workflow and evaluation UI.
- `app/api/workspace/route.ts`: authenticated API with CSRF origin check, validated input, per-owner storage, and compare-and-swap persistence.
- `lib/atlas-types.ts`: evidence, relation, citation, run and evaluation contracts.
- `lib/atlas-engine.ts`: deterministic retrieval, authorization, lifecycle, impact, and evaluation logic.
- `lib/atlas-data.ts`: 22 synthetic records and relationships, loaded server-side.
- `db/schema.ts`, `drizzle/`: pilot storage schema and migrations.
- `production/bigquery-provider.ts`: disabled-by-default integration seam for delegated-identity vector search. Mock-tested; not live-connected.
- `sql/`: BigQuery discovery and foundation templates. Apply only after source mapping and ACL design.
- `tests/`: lifecycle and adapter tests, including the executable evaluation fixture.
- `public/handoff.md`: complete work-environment transfer prompt.

## Try it
1. In Explore, select **Takt time & its consumers**.
2. Click a graph node or source citation to inspect its revision and hash.
3. Open the decision loop, save a proposal, switch to Steward, approve in the sandbox, and record an outcome.
4. Run Evaluations to execute isolated lifecycle tests (these do not mutate your evidence corpus).
5. As Steward, restrict or delete a sample source, then rebuild. Observe how retrieval and saved run visibility change.

## Boundaries
The running app uses keyword/alias matching and explicit graph edges. Answers are verbatim source extracts. No embedding endpoint, semantic vector retrieval, LLM, live source sync, multi-user collaboration, or operational execution is active. Role selection is a fixture simulator within an owner-private workspace.

The JSON workspace store is intentionally bounded to 250 investigation runs and 5,000 audit events. Production needs normalized evidence tables, source connectors, identity reconciliation, a transactional workflow store, and real evaluation data. The D1 snapshot retains evidence versions but does not provide immutable external audit storage or prove physical erasure of backups. Historical runs containing revoked or retired evidence are hidden; deleted evidence text is scrubbed from dependent stored runs. Graph edges are invalidated when their supporting source revision changes.

Build and automated logic tests were run. Browser visual QA was not available in the authoring environment. GCP SQL is a template and has not been executed against a live BigQuery project.

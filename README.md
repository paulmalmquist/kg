# Evidence Atlas

A working, private knowledge and decision-loop pilot for Relativity's data architecture initiative. All bundled records are synthetic. No Relativity data, GCP credentials, or company systems are connected.

## Features
Explore keyword/alias retrieval and graph context; inspect source revisions and SHA-256 citations; test access restrictions, retirement, deletion and rebuild; record proposal/approval/outcome history; run an isolated 16-case evaluation suite; export investigations and source. The initial scenario follows metric definitions through dbt implementations to Dreamcatcher/Power BI/Grafana consumers, with a small engineering-only test/lot example.

## Runtime
React 19 + TypeScript on the supplied Vinext/Cloudflare runtime. Cloudflare D1 persists an owner-scoped synthetic workspace with optimistic concurrency. Hosted access is owner-private; every API operation also requires platform-authenticated identity. Demo personas alter fixture permissions only. They are not an authorization system for real corporate data.

## Setup and verification
Node >=22.13 (Node 24 recommended), pnpm 11.

```sh
pnpm install --frozen-lockfile
node --experimental-strip-types --test tests/*.test.ts
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

`tests/redteam.test.ts` is the adversarial suite, grouped by what each case measures (authorization safety, graph completeness, relevance and citation support, lifecycle, decision integrity, persistence). One case is a recorded known limitation (`todo`: lexical retrieval has no relevance threshold) and one is not applicable to the pilot (`skip`: vector recall).

The Sites helper configures hosted resources from `.openai/hosting.json`; `d1` is `DB`. Schema migrations are committed in `drizzle/`. Local preview requires applying migrations to local D1 and the platform-supported authenticated preview path. Do not add a production identity bypass to make local testing easier. For a work-environment deployment, replace the platform auth and D1 repository boundary with approved corporate equivalents; the rest of the app is ordinary React/TypeScript and portable pure logic.

## Repository map
- `app/components/`: explorer, SVG graph, evidence inspector, decision workflow and evaluation UI.
- `app/api/workspace/route.ts`: authenticated API with CSRF origin check, validated input, per-owner storage, and compare-and-swap persistence.
- `lib/atlas-types.ts`: evidence, relation, citation, run and evaluation contracts.
- `lib/atlas-engine.ts`: deterministic retrieval, authorization, lifecycle, impact, evaluation, and snapshot-upgrade logic.
- `lib/atlas-data.ts`: 22 synthetic records and relationships, loaded server-side.
- `db/schema.ts`, `drizzle/`: pilot storage schema and migrations.
- `production/bigquery-provider.ts`: disabled-by-default integration seam for delegated-identity vector search. Mock-tested; not live-connected.
- `sql/`: BigQuery discovery and foundation templates. Apply only after source mapping and ACL design.
- `tests/`: lifecycle, adversarial, and adapter tests, including the executable evaluation fixture.
- `public/handoff.md`: complete work-environment transfer prompt.

## Try it
1. In Explore, select **Takt time & its consumers**.
2. Click a graph node or source citation to inspect its revision and hash.
3. Open the decision loop, save a proposal, switch to Steward, approve in the sandbox, and record an outcome.
4. Run Evaluations to execute isolated lifecycle tests (these do not mutate your evidence corpus).
   Graph-assisted answers show the object impact was computed from, any reasons the result may be incomplete, and other starting objects to recompute from.
5. As Steward, restrict, retire, or delete a sample source, then rebuild. Observe how retrieval, saved run visibility, and approval eligibility change.

## Boundaries
The running app uses keyword/alias matching and explicit graph edges. Answers are verbatim source extracts. No embedding endpoint, semantic vector retrieval, LLM, live source sync, multi-user collaboration, or operational execution is active. Role selection is a fixture simulator within an owner-private workspace.

The JSON workspace store is intentionally bounded to 250 investigation runs, 5,000 audit events, and a 1.8 MB snapshot budget (Cloudflare D1 rows are limited to 2 MB). Revocation, retirement, and deletion are exempt from these limits so capacity can never block an access change. Production needs normalized evidence tables, source connectors, identity reconciliation, a transactional workflow store, and real evaluation data.

Lifecycle semantics in the pilot:
- **Revocation** hides saved runs whose cited evidence the persona can no longer read; every non-cited reference in a visible run (graph context, impact results, ranked candidates, relationship versions) is reauthorized individually.
- **Retirement** removes evidence from retrieval but keeps decision history visible, marked as changed; approval then requires a fresh investigation.
- **Deletion** scrubs dependent run text and removes the record from graph context, impact results, relationships, and the index. Only the tombstone and audit trail keep its ID. This is application deletion: D1 Time Travel can restore earlier database states for its retention window (30 days on paid plans), and content already delivered to a browser or exported is outside the app's control.
- **Revision** invalidates relationships supported by the previous revision. Impact results report them as excluded rather than silently shrinking. Re-publishing identical text is refused.
- **Approval** is refused when cited evidence, its access policy, or any relationship version behind the impact result has changed. Graph runs saved before relationship versions were captured must be rerun before approval.

Impact analysis follows dependency relations from an explicit starting object or, if none is chosen, the top keyword match (disclosed, with alternatives). Results are marked incomplete when computed within a restricted access scope, when the hop limit was reached, or when relationships were excluded as stale. Ranking is lexical keyword overlap; the matched terms are shown so a weak match (for example, one generic word) is visible.

Build, lint, typecheck, and automated logic tests were run. Route behavior was exercised against a local Workers + D1 emulator, and the UI was checked in headless Chromium at desktop and 390 px widths; the hosted platform and its identity proxy were not tested. The local D1 emulator does not enforce the 2 MB row limit. GCP SQL is a template and has not been executed against a live BigQuery project.

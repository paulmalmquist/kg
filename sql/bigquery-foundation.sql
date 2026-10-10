-- TEMPLATE: substitute PROJECT_ID and DATASET_ID only after source discovery.
-- Deploy to the approved development project. This creates no access policies.
-- Configure source-equivalent RLS on evidence_current, chunks, entities, edges,
-- and appropriate privileges on tombstones BEFORE exposing any retrieval API.
CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.evidence_current` (
  evidence_id STRING NOT NULL,
  revision INT64 NOT NULL,
  source_system STRING,
  source_uri STRING,
  source_revision STRING,
  title STRING,
  status STRING, -- approved | provisional | retired | deleted
  classification STRING,
  policy_version INT64,
  source_acl JSON,
  valid_from TIMESTAMP,
  recorded_at TIMESTAMP,
  content_hash STRING
) CLUSTER BY evidence_id;

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.evidence_revisions` (
  evidence_id STRING NOT NULL,
  revision INT64 NOT NULL,
  source_uri STRING,
  source_revision STRING,
  artifact_uri STRING,
  normalized_text STRING,
  content_hash STRING,
  extractor_version STRING,
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  recorded_at TIMESTAMP,
  retention_class STRING
) PARTITION BY DATE(recorded_at) CLUSTER BY evidence_id;

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.chunks` (
  chunk_id STRING NOT NULL,
  evidence_id STRING NOT NULL,
  revision INT64 NOT NULL,
  content STRING,
  content_hash STRING,
  span_start INT64,
  span_end INT64,
  chunker_version STRING,
  embedding_model STRING,
  embedding ARRAY<FLOAT64>,
  status STRING,
  is_current BOOL,
  policy_version INT64,
  source_acl JSON,
  recorded_at TIMESTAMP
) CLUSTER BY evidence_id;

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.tombstones` (
  evidence_id STRING NOT NULL,
  source_event_id STRING NOT NULL,
  revoked_at TIMESTAMP,
  reason_code STRING,
  source_sequence STRING
) CLUSTER BY evidence_id;

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.entities` (
  entity_id STRING NOT NULL,
  entity_type STRING,
  source_system STRING,
  source_id STRING,
  revision STRING,
  aliases ARRAY<STRING>,
  attributes JSON,
  policy_version INT64
) CLUSTER BY entity_type, entity_id;

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.edges` (
  edge_id STRING NOT NULL,
  from_entity_id STRING,
  to_entity_id STRING,
  relation STRING,
  evidence_id STRING,
  evidence_revision INT64,
  extraction_version STRING,
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  recorded_at TIMESTAMP,
  review_status STRING
) CLUSTER BY from_entity_id, to_entity_id;

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.decision_events` (
  event_id STRING NOT NULL,
  run_id STRING,
  stage STRING,
  actor_id STRING,
  event_time TIMESTAMP,
  evidence_manifest JSON,
  policy_version STRING,
  prompt_version STRING,
  model_version STRING,
  simulation_version STRING,
  payload_uri STRING
) PARTITION BY DATE(event_time) CLUSTER BY run_id;

-- Consider IVF for single-query interactive requests after the corpus is large
-- enough for index population. Verify actual use in job metadata. Index creation
-- is NOT embedding generation and does not preserve source ACLs by itself.
--
-- Checked against docs.cloud.google.com/bigquery/docs/vector-index on 2026-10-10:
-- * A base-table filter is a true pre-filter only on STORED columns; any other
--   predicate effectively becomes a post-filter, which can return fewer than
--   top_k rows, potentially zero. The provider's status/is_current/model filter
--   therefore needs these stored columns.
-- * Stored columns are NOT used when the table has a row-level access policy or
--   the column has a policy tag. The source-equivalent RLS required above turns
--   these filters back into post-filters: measure underfill per permission
--   profile and over-fetch or brute-force rather than loosening access.
-- * Every embedding in the indexed column must have the same dimension. Keep one
--   embedding model (or one dimension) per table rather than mixing models here.
-- * Tables under 10 MB do not populate the index; queries fall back to brute force.
CREATE VECTOR INDEX IF NOT EXISTS chunks_embedding_idx
ON `PROJECT_ID.DATASET_ID.chunks`(embedding)
STORING(status, is_current, embedding_model)
OPTIONS(index_type = 'IVF', distance_type = 'COSINE');

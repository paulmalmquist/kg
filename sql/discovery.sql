-- Read-only discovery. Replace PROJECT_ID, REGION, and DATASET_ID.
-- Region qualifier example: region-us. Query job location must match.
SELECT table_catalog, table_schema, table_name, table_type
FROM `PROJECT_ID.region-REGION.INFORMATION_SCHEMA.TABLES`
WHERE REGEXP_CONTAINS(LOWER(table_name), r'metric|certif|lineage|inspection|shift|demand|quality')
ORDER BY table_schema, table_name;

SELECT table_name, column_name, data_type, is_nullable
FROM `PROJECT_ID.DATASET_ID.INFORMATION_SCHEMA.COLUMNS`
ORDER BY table_name, ordinal_position;

-- Confirm prerequisites before deciding on graph or vector serving.
SELECT table_name, index_name, index_status, coverage_percentage, last_refresh_time
FROM `PROJECT_ID.DATASET_ID.INFORMATION_SCHEMA.VECTOR_INDEXES`;

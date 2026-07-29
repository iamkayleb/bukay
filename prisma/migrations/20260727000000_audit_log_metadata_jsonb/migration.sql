-- Store audit metadata as queryable structured JSON instead of serialized text.
ALTER TABLE "AuditLog"
ALTER COLUMN "metadata" TYPE JSONB
USING CASE
  WHEN "metadata" IS NULL THEN NULL
  WHEN btrim("metadata") = '' THEN NULL
  WHEN "metadata" ~ '^\s*[\[{]' THEN "metadata"::jsonb
  ELSE to_jsonb("metadata")
END;

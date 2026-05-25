-- VyaparNet: Extensions, Triggers, GIN Indexes, Autovacuum
-- AUTHORITY: architecture/database/VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md
-- This migration adds items that Prisma cannot generate natively.

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Full Text Search: Auto-update trigger for Product.search_vector
CREATE OR REPLACE FUNCTION product_search_update()
RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('simple', coalesce(NEW."name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."description", '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_search_trigger
  BEFORE INSERT OR UPDATE ON "Product"
  FOR EACH ROW
  EXECUTE FUNCTION product_search_update();

-- Full Text Search: Auto-update trigger for SearchProductDocument.search_vector
CREATE OR REPLACE FUNCTION search_doc_update()
RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    to_tsvector('simple', coalesce(NEW."name", ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER search_doc_trigger
  BEFORE INSERT OR UPDATE ON "SearchProductDocument"
  FOR EACH ROW
  EXECUTE FUNCTION search_doc_update();

-- GIN Index: Product full-text search (Tier 1 - CRITICAL)
CREATE INDEX IF NOT EXISTS idx_prod_search_vector
  ON "Product" USING GIN ("search_vector")
  WHERE "isDeleted" = false;

-- GIN Index: Product name fuzzy search (pg_trgm) (Tier 1)
CREATE INDEX IF NOT EXISTS idx_prod_name_trgm
  ON "Product" USING GIN ("name" gin_trgm_ops)
  WHERE "isDeleted" = false;

-- Autovacuum tuning for high-write tables (per Indexing Strategy)
ALTER TABLE "Inventory"
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.02);

ALTER TABLE "Payment"
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.02);

ALTER TABLE "EventOutbox"
  SET (autovacuum_vacuum_scale_factor = 0.02,
       autovacuum_analyze_scale_factor = 0.01);

ALTER TABLE "Order"
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.02);
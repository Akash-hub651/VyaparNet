-- 1. Drop v1.0 trigger and GIN index on Product table
DROP TRIGGER IF EXISTS product_search_trigger ON "Product";
DROP FUNCTION IF EXISTS product_search_update();
DROP INDEX IF EXISTS idx_prod_search_vector;

-- 2. Modify search_doc_trigger to ONLY fire on INSERT, not UPDATE
DROP TRIGGER IF EXISTS search_doc_trigger ON "SearchProductDocument";
CREATE TRIGGER search_doc_trigger
  BEFORE INSERT ON "SearchProductDocument"
  FOR EACH ROW
  EXECUTE FUNCTION search_doc_update();

-- 3. Recreate the Sprint 2 GIN index concurrently
-- Note: If this fails due to transaction wrapping by Prisma, we will drop CONCURRENTLY 
-- but it's required for production deployment (which should run outside Prisma transactions for indices)
DROP INDEX IF EXISTS idx_spd_search_vector;
CREATE INDEX idx_spd_search_vector
  ON "SearchProductDocument" USING GIN (search_vector)
  WHERE "needsReindex" = false;

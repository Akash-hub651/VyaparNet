# VYAPARNET — SPRINT 2 FINAL ARCHITECTURE AUDIT & LOCKED SPECIFICATION
## Enterprise Deep Architecture Review + Hardening Pass
### Authority: Principal Enterprise Architect | Version: v2.0 FINAL LOCK
### Date: 2025-05-27

---

## PART 1: OVERALL ARCHITECTURE ASSESSMENT

### Strengths (Preserved and Noted)

The Sprint 2 draft demonstrates solid foundational thinking in several areas. The segment isolation philosophy is correctly identified as a repository-layer concern rather than a service or controller concern. The EventOutbox atomic write pattern — writing the domain event, the SearchReindexJob, and the domain entity in a single `$transaction` — is architecturally sound and correctly avoids the distributed consistency problem. The three-tier product ownership chain (User → Business → Product) correctly models B2B supplier identity. The search fallback chain (GIN → pg_trgm ILIKE) is appropriately humble about MVP search limitations. The media pipeline's asynchronous processing design correctly separates the upload acknowledgement from the processing concern.

### Weaknesses (Requiring Hardening)

The draft contains six architectural weaknesses that, left unaddressed, will cause painful rewrites within 12–18 months:

**1. Segment-specific product attributes are architecturally missing.** The draft creates a Product table with fixed fields. In 12 months, when Pharma requires `batchNumber`, `expiryPolicy`, `fdaCompliance`, and Electronics requires `voltage`, `compatibility`, `certifications`, the team will either pollute the Product table with nullable columns (god schema anti-pattern) or face a schema rewrite. This is the single most dangerous architectural gap.

**2. Segment-specific validation is hardcoded by implication.** The Zod schema `CreateProductSchema` in the draft is a single monolithic schema. When segments require different mandatory fields, different value ranges, and different business rules, this collapses into conditional chaos.

**3. Segment-specific approval policies are not modeled.** The approval service reads a single `SELLER_AUTO_APPROVE_THRESHOLD` AppConfig key. Pharma sellers will require regulatory document verification, textile sellers may require GST + trade certificate, spare parts may require brand authorization. A single threshold per platform is already wrong.

**4. Search ranking is segment-unaware.** The ts_rank formula weights Name:1.0, Description:0.4 universally. Textile search should rank by color/fabric relevance. Pharma search should boost compliance attributes. Spare parts search should boost vehicle compatibility. A universal ranking function will produce poor results as segments grow.

**5. Media/document governance treats all uploads identically.** The draft validates MIME type and size and stores in S3. It does not model segment-specific document requirements: a pharmaceutical product requires a drug license scan, a textile product may require a fabric composition certificate, an electronics product may require a CE marking document. These are not product images — they are compliance documents with their own governance lifecycle.

**6. Category tree is a flat seed with no metadata.** Categories are seeded with name/slug/displayOrder. There is no mechanism to attach segment-specific filter configurations, segment-specific search boost rules, or segment-specific attribute schemas to categories. This will require a schema extension that touches every downstream system when segments multiply.

### Scalability Quality: MEDIUM
PostgreSQL GIN at 1M+ products with concurrent writes is a known bottleneck. The GIN index has high write amplification on large tables. The draft acknowledges the OpenSearch migration path but does not harden the abstraction layer sufficiently to make the migration non-disruptive.

### Operational Quality: GOOD
The observability requirements are comprehensive. The rollback strategy is realistic. The seed idempotency requirement is correct.

### Future Extensibility Quality: POOR → MUST BE UPGRADED
The current draft will require major rewrites for the third segment addition. The audit pass below addresses this specifically.

---

## PART 2: CRITICAL RISKS

### CRITICAL-1: God Product Schema Anti-Pattern (No Segment Attributes)

**Risk:** The current Product model has a `metadata JSONB` field that is not used in the draft. This must be formally designated as the `segmentAttributes JSONB` field. Without a disciplined segment attribute architecture, within 6 months of adding a third segment, developers will add columns to Product table directly.

**Impact:** Irreversible schema pollution. Every query, every API response, every DTO carries dead weight from every other segment. Catastrophic at 10+ segments.

**Required Fix:** Formal `SegmentAttributeSchema` system — see Section 6 below.

---

### CRITICAL-2: Search Rankings Not Segment-Scoped

**Risk:** A single ts_rank formula across all segments produces degraded search quality as segments grow. More importantly, the search index (`search_vector` tsvector) is computed from `name` and `description` for all segments uniformly. Textile search needs fabric/weave/color terms boosted. Spare parts search needs part-number, vehicle model, OEM code boosted. These live in `segmentAttributes`, not in name/description.

**Impact:** Search quality degrades with each new segment. By segment 3, search is effectively unusable without an OpenSearch migration. This forces a premature and disruptive OpenSearch migration.

**Required Fix:** Search trigger and ranking must be segment-aware. The tsvector computation must include segment-specific attribute values. See Section 10 (Search Architecture Review) for the complete fix.

---

### CRITICAL-3: Approval Workflow Has No Segment Policy Model

**Risk:** `SELLER_AUTO_APPROVE_THRESHOLD` is a single platform-wide AppConfig key. The moment Pharma is added as a segment, pharma product listings require regulatory compliance verification that has nothing to do with a trust score threshold. Textile sellers in different geographies may require different documentation.

**Impact:** The approval service becomes a conditional explosion of `if (segment === 'pharma')` checks, or worse, is bypassed by developers who don't know where the rule lives.

**Required Fix:** `SegmentApprovalPolicy` model — configurable per segment, not per platform.

---

### CRITICAL-4: Segment-Specific Validation Is Not Abstracted

**Risk:** `CreateProductSchema` is a single Zod schema. When Pharma requires `batchPolicy: required`, `drugLicenseNumber: required`, and Textile requires `fabricComposition: required`, `gsm: required`, the options are: (a) make all fields optional and validate in service layer (loses type safety), (b) have separate endpoints per segment (violates DRY), or (c) have one enormous schema with optional fields for every segment (god schema).

**Impact:** By segment 3, validation code is unmaintainable.

**Required Fix:** `SegmentProductSchemaRegistry` — see Section 7 below.

---

### CRITICAL-5: EventOutbox Deduplication Key Is Not Idempotent Under Retry

**Risk:** The draft uses `product-${product.id}-created-${Date.now()}` as the deduplication key. If the transaction is retried (Prisma transaction retry on deadlock), a new timestamp generates a new key, allowing duplicate events.

**Impact:** Double notification, double search reindex, double analytics event. At scale with retry storms, this causes observable inconsistency.

**Required Fix:** Deduplication key must be deterministic — `product-created-${product.id}` with TTL-based deduplication check. For updates, version-based: `product-updated-${product.id}-v${product.version}`.

---

### CRITICAL-6: Search Cache Is Not Segment-Safe Under Multi-Segment Admin Access

**Risk:** Admin users can query across segments. If an admin search result is accidentally cached with a key that omits the admin context, it could be served to a buyer-scoped request. The cache key includes `segment` but not the `isAdmin` flag.

**Impact:** Cross-segment data served to buyers. Trust violation.

**Required Fix:** Search cache keys must explicitly encode the access scope: `search:v1:{scope}:{segment}:{queryHash}` where scope is `buyer` or `admin`.

---

## PART 3: MEDIUM RISKS

### MEDIUM-1: GIN Index Write Amplification at Scale

At 1M+ products with concurrent writes (updates to name/description trigger full tsvector recomputation), the GIN index becomes a write bottleneck. Each product update that changes name or description causes the GIN index to be updated via the trigger. At high write concurrency (bulk seller uploads in Phase 2), this creates lock contention.

**Mitigation required:** Index update strategy must use asynchronous trigger pattern. The trigger should mark `SearchProductDocument.needsReindex = true` and the actual GIN index update should happen via the background SearchReindexWorker, not synchronously on every write. The current draft has the SearchReindexWorker but the GIN trigger still fires synchronously on every Product write.

**Correct architecture:**
- Product write → triggers marks SearchProductDocument.needsReindex=true (fast, no GIN update)
- SearchReindexWorker → reads needsReindex=true records → rebuilds search_vector → updates GIN
- Result: GIN updates are batched and async, not blocking product writes

Note: This defers GIN consistency by the worker polling interval (acceptable for B2B search).

---

### MEDIUM-2: Cache Stampede Risk on Category Tree

The category tree is cached per segment with TTL 3600s. On cache expiry, concurrent requests all hit the DB simultaneously. At moderate traffic (50+ concurrent buyers), this creates a DB spike.

**Mitigation:** Implement staggered TTL with background refresh. When TTL drops below 300s, trigger a background cache refresh without waiting for expiry. Redis `PTTL` check + conditional refresh job in BullMQ.

---

### MEDIUM-3: Slug Uniqueness Check Has Race Condition

The slug generation pattern (generate slug → check uniqueness → add suffix if collision) has a TOCTOU race condition. Two concurrent product creation requests with the same name will both check uniqueness, both find no collision, and both attempt to insert the same slug. The `Product.slug UNIQUE` constraint will reject one, but the error will surface as an unhandled Prisma `P2002` error.

**Required:** The `ProductRepository.create()` must wrap the slug-related unique constraint violation in a retry loop with a new random suffix. The service layer must handle `P2002` constraint violations gracefully with retry + new slug.

---

### MEDIUM-4: Media Orphan Cleanup Does Not Account for Upload-in-Progress State

The orphan cleanup job finds Media records with no ProductMedia link older than N hours. But a seller who uploads images and then takes 2+ hours to complete the product form will have their media deleted before they submit. The cleanup TTL must be at minimum 24 hours, not "a few hours."

**Additionally:** The draft should introduce a `MediaSession` concept — uploads are tagged with a session identifier that expires in 24h. Only expired sessions with no linked Product are candidates for cleanup.

---

### MEDIUM-5: ProductMedia Link Does Not Preserve Display Order

The `ProductMedia` junction table has no `displayOrder` column. The first image a seller uploads should be the primary (thumbnail) image. With no ordering, every query returns images in random order (DB insertion order is not guaranteed). This causes the "primary image" to change arbitrarily after product updates.

**Required:** Add `displayOrder Int @default(0)` to ProductMedia model. The ProductService.createProduct sets displayOrder based on the order mediaIds are provided.

Note: This does not require a schema migration since the column was already defined in v4.3 schema — verify this against the frozen schema document.

---

### MEDIUM-6: Seller Business Cache Could Serve Stale Business After Suspension

The draft caches `seller_business:{userId}` for 300s. If an admin suspends a seller's business between requests, the cached business continues to be used for product mutations for up to 5 minutes. During this window, the seller can continue to create/update products against a suspended business.

**Required:** Business cache must be invalidated when business status changes. The Admin suspension action (Sprint 7) must call a `BusinessCacheService.invalidate(userId)` method. The cache key must also encode the business `isActive` state so a freshly loaded record doesn't get served from a stale cache.

---

### MEDIUM-7: SearchReindexJob Queue Can Grow Unbounded

The SearchReindexJob table records are created on every product write. The worker processes them and sets `processedAt`. But there is no cleanup for old processed records. At 10,000 product updates per day, this table grows 300K rows per month.

**Required:** SearchReindexJob cleanup cron (weekly) removes processed records older than 30 days. This aligns with the data retention policy from PRD (operational logs 30 days).

---

## PART 4: MINOR IMPROVEMENTS

### MINOR-1: Product Detail Response Should Include Breadcrumb

The `ProductDetailResponse` should include a `breadcrumb` array: `[{ id, name, slug }]` from root category to leaf category. This avoids N additional category API calls from the frontend.

### MINOR-2: Search Suggestions Should Distinguish Query Types

The stub implementation should be designed to support two future suggestion types: (a) query completions from recent popular searches, and (b) entity suggestions (product names, seller names, category names). The API response should return a typed structure, not a flat string array, to avoid a breaking API change later.

Suggested response shape from Sprint 2 stub:
```
{ queries: string[], categories: CategorySuggestion[], products: ProductSuggestion[] }
```

### MINOR-3: SearchAnalytics Sampling

Logging every search query to SearchAnalytics at high scale creates a write-heavy table. At 10K searches/hour, this is 240K rows/day. Implement 10% sampling at the service layer from Sprint 2 (log 1 in 10 queries). Full logging can be enabled via AppConfig `SEARCH_ANALYTICS_SAMPLE_RATE`.

### MINOR-4: AuditLog Must Include Version Number

The current AuditLog entry for product updates does not include the product version number. Without the version, it is impossible to correlate "what was the state of the product when this audit entry was written" — crucial for compliance disputes.

AuditLog.newValue must include `{ ...changes, version: product.version }`.

### MINOR-5: Media Processing Job Must Include Retry Context

The image processing worker job data should include `{ mediaId, s3Key, productId, attempt: 0 }`. The attempt counter enables the worker to use progressively lower quality settings on retry (attempt 1: quality 80, attempt 2: quality 70) to handle large file processing failures gracefully.

---

## PART 5: FUTURE SCALABILITY RISKS

### SCALE-1: PostgreSQL GIN at 10M+ Products

At 10M products across segments, the GIN index on `Product.search_vector` will be 1–2GB. Query performance degrades non-linearly above 5M rows with complex tsquery patterns. The async reindex architecture (MEDIUM-1 fix) partially mitigates this, but OpenSearch migration should be triggered at the 500K product mark, not waited until query SLAs breach.

**Trigger metric to add to observability:** `search_gin_index_size_bytes` — alert at 500MB.

### SCALE-2: ProductMedia Query N+1 Risk in List Endpoints

`GET /products?segment=TEXTILE` returns a paginated list. Each product needs its primary thumbnail. If the repository fetches products then separately fetches ProductMedia for each, this is N+1 at the DB layer. The repository must use a single JOIN query with `GROUP BY p.id HAVING min(pm.displayOrder)` to get primary media in one query.

### SCALE-3: Segment Filter on Category Tree Becomes Expensive

As category trees grow (500+ categories per segment), the recursive category query with `include: { children: { include: { children: true } } }` becomes exponentially expensive. At 3 levels deep with 500 categories, Prisma generates complex recursive includes that are not index-optimized.

**Required:** Store the category tree as a materialized JSON blob in Redis (already caching, but the DB query on cache miss must use a raw recursive CTE query, not Prisma include recursion).

### SCALE-4: EventOutbox Table Becomes a Hotspot

At 10K product operations/hour, the EventOutbox table receives 10K+ writes/hour. The outbox consumer polls `WHERE status='PENDING'` every 5 seconds. This creates a sequential scan on status field. The `idx_eob_stat_retry_date` index from the frozen schema mitigates this, but the table will accumulate fast-growing COMPLETED records that bloat index scans.

**Required:** Automated COMPLETED record archival/deletion at 48h TTL. Must be added to the Sprint 9 maintenance jobs plan, but the EventOutbox table partition strategy (eventMonth) must be activated from Sprint 2 — verify the `eventMonth` field is populated correctly.

### SCALE-5: Seller Business Cache at High Seller Concurrency

At 10K concurrent sellers, `seller_business:{userId}` Redis keys consume significant memory. With 50-byte keys and 200-byte values, 10K entries = 2.5MB — acceptable. At 100K sellers, 25MB — still acceptable. At 1M sellers — consider a Redis hash instead of individual string keys.

---

## PART 6: FUTURE REWRITE RISKS

### REWRITE-1: Product Schema Will Require Restructuring for Segment Attributes (HIGH RISK)

**This is the single highest rewrite risk in Sprint 2.** Without a formal segment attribute architecture established now, the Product table will accumulate segment-specific columns within 6 months. Restructuring a table with millions of rows in production is catastrophic.

**The Fix — SegmentAttributeSchema Architecture:**

```
MODEL: SegmentAttributeSchema
  id            CUID
  segment       Segment (enum)
  version       Int
  schema        JSONB  ← JSON Schema definition of required/optional attributes
  isActive      Boolean
  createdAt     DateTime
  updatedAt     DateTime

EXAMPLE SCHEMA VALUE (for TEXTILE):
  {
    "required": ["fabricComposition", "gsm", "width"],
    "optional": ["weave", "finish", "shrinkage"],
    "properties": {
      "fabricComposition": { "type": "string", "maxLength": 200 },
      "gsm": { "type": "number", "min": 50, "max": 2000 },
      "width": { "type": "number", "unit": "cm" }
    }
  }

EXAMPLE SCHEMA VALUE (for SPARE_PARTS):
  {
    "required": ["vehicleCompatibility", "partNumber"],
    "optional": ["oemCode", "brandName"],
    "properties": {
      "vehicleCompatibility": { "type": "array", "items": { "type": "string" } },
      "partNumber": { "type": "string", "pattern": "^[A-Z0-9-]+$" }
    }
  }

Product.segmentAttributes JSONB:
  Stores the actual attribute values per the schema for this product's segment.
  Validated at service layer against SegmentAttributeSchema.schema at creation time.

  Example (TEXTILE product):
  {
    "fabricComposition": "65% Polyester, 35% Cotton",
    "gsm": 180,
    "width": 44,
    "weave": "plain"
  }
```

**This architecture:**
- Does NOT pollute Product table with segment-specific columns
- Does NOT require schema migrations when new segments add attributes
- Does NOT require code changes to add new attribute types
- DOES enable segment-specific search indexing (include attribute values in tsvector)
- DOES enable segment-specific filtering (JSON path queries on attributes)
- DOES enable future AI extraction of attributes from product descriptions

**SegmentAttributeSchema is seeded** for TEXTILE and SPARE_PARTS in Sprint 2. New segments add their schema via Admin UI (Sprint 7) or seed scripts.

---

### REWRITE-2: Validation Architecture Will Collapse Under Segment Multiplication

**The Fix — SegmentProductSchemaRegistry:**

```
REGISTRY DESIGN (service-layer, no additional DB table needed):

SegmentProductSchemaRegistry:
  private schemas: Map<Segment, ZodSchema>
  
  register(segment: Segment, schema: ZodSchema): void
  get(segment: Segment): ZodSchema
  validate(segment: Segment, data: unknown): ValidationResult

Base schema: Fields common to ALL segments (name, description, basePrice, moq, unit, categoryId)
Segment schema: Fields specific to one segment (stored as Zod extensions of base schema)

Usage in ProductsService.createProduct():
  const schema = schemaRegistry.get(dto.segment)
  const result = schema.safeParse(dto)
  if (!result.success) throw ValidationException

HOW TO ADD NEW SEGMENT (Pharma example):
  1. Create PharmaProductSchema.ts (extends BaseProductSchema, adds batchPolicy, drugLicense fields)
  2. Register in SegmentProductSchemaRegistry constructor
  3. Zero changes to existing code paths

This replaces the monolithic CreateProductSchema with a registry pattern.
```

---

### REWRITE-3: Approval System Architecture Will Fragment

**The Fix — SegmentApprovalPolicy:**

```
MODEL: SegmentApprovalPolicy
  id            CUID
  segment       Segment
  policyType    Enum: AUTO_APPROVE | MANUAL_REVIEW | DOCUMENT_REQUIRED | COMPLIANCE_CHECK
  minTrustScore Int default(0)
  requiredDocs  String[] (MediaType identifiers that must be uploaded before approval)
  expiryDays    Int? (approval expires and requires renewal — Pharma use case)
  isActive      Boolean
  createdAt     DateTime
  updatedAt     DateTime

EXAMPLES:
  TEXTILE: { policyType: AUTO_APPROVE, minTrustScore: 0 }
  SPARE_PARTS: { policyType: AUTO_APPROVE, minTrustScore: 0 }
  PHARMA (future): { policyType: DOCUMENT_REQUIRED, requiredDocs: ['DRUG_LICENSE', 'FSSAI_CERT'], expiryDays: 365 }
  ELECTRONICS (future): { policyType: DOCUMENT_REQUIRED, requiredDocs: ['CE_MARKING', 'BIS_CERT'] }

ProductApprovalService.getPolicy(segment: Segment): SegmentApprovalPolicy
  → DB lookup (cached in Redis 5min)
  → Falls back to default: { policyType: MANUAL_REVIEW } if no policy defined

This replaces the single SELLER_AUTO_APPROVE_THRESHOLD with per-segment policies.
New segments get their policy configured without ANY code changes.
```

---

### REWRITE-4: Search Ranking Will Require Per-Segment Tuning

**The Fix — SegmentSearchConfig:**

```
MODEL: SegmentSearchConfig (stored in AppConfig as JSON keyed by segment)
  Key: search_config_{segment}
  Value: {
    "tsvectorFields": [
      { "field": "name", "weight": "A" },
      { "field": "description", "weight": "B" },
      { "field": "segmentAttributes.fabricComposition", "weight": "B" },  // TEXTILE
      { "field": "segmentAttributes.partNumber", "weight": "A" }          // SPARE_PARTS
    ],
    "rankingBoosts": {
      "isVerifiedSeller": 1.5,
      "hasImages": 1.2,
      "inStock": 1.3
    },
    "synonymsKey": "synonyms_{segment}",
    "filterFields": ["gsm", "fabricComposition", "vehicleCompatibility"],
    "defaultSort": "relevance"
  }

SearchService reads SegmentSearchConfig per segment.
The tsvector trigger becomes segment-aware:
  search_vector = combine(
    name at weight A,
    description at weight B,
    [flatten segmentAttributes values relevant to this segment at weight B]
  )

This makes search naturally richer as segments mature without code changes.
```

---

### REWRITE-5: Media/Document Architecture Conflates Product Images with Compliance Documents

**The Fix — MediaClassification:**

```
Extend Media model (via metadata JSONB or explicit enum):
  mediaClass: Enum: PRODUCT_IMAGE | COMPLIANCE_DOCUMENT | SWATCH | SPEC_SHEET | CAD_FILE

Extend SegmentAttributeSchema to define required mediaClasses:
  "requiredMedia": [
    { "class": "PRODUCT_IMAGE", "min": 1, "max": 10 },
    { "class": "COMPLIANCE_DOCUMENT", "subtypes": ["GST_CERTIFICATE", "TRADE_LICENSE"], "required": false }
  ]

TEXTILE product: PRODUCT_IMAGE required (1-10), SWATCH optional
PHARMA product (future): PRODUCT_IMAGE required, COMPLIANCE_DOCUMENT (DRUG_LICENSE) required
ELECTRONICS product (future): PRODUCT_IMAGE required, SPEC_SHEET optional, CE_MARKING required

MediaValidationService.validateForSegment(mediaIds, segment):
  → Load SegmentAttributeSchema.requiredMedia for this segment
  → Check all required mediaClass types are satisfied
  → Return validation result

Product creation validation (ProductsService.createProduct()):
  → MediaValidationService.validateForSegment(dto.mediaIds, dto.segment)
  → Only blocks if required documents missing

This handles ALL future media requirements without code changes.
```

---

## PART 7: MISSING ARCHITECTURAL PIECES

### MISSING-1: SegmentAttributeSchema — No Schema in Draft

The `segmentAttributes JSONB` field exists in the Product model (v4.3 schema uses `metadata JSONB`) but the SegmentAttributeSchema governance model is absent from the Sprint 2 draft entirely. Without it, JSONB is a free-form bag of data with no enforcement. This is the most critical missing piece.

**Add to Sprint 2 scope:** SegmentAttributeSchema model + seed data + validation integration in ProductsService.

### MISSING-2: SegmentApprovalPolicy — No Per-Segment Approval Logic

Sprint 2 draft has a single threshold. SegmentApprovalPolicy must be defined now, even if both initial segments use AUTO_APPROVE. The policy infrastructure prevents the conditional explosion later.

### MISSING-3: ProductMedia.displayOrder — Missing Column

The display order of product images must be preserved. Without it, the "primary thumbnail" is non-deterministic.

### MISSING-4: Search Suggestions API Has No Type Structure

The stub returns `string[]`. The typed structure must be defined now to prevent a breaking API change in Sprint 6 when real suggestions are implemented.

### MISSING-5: Segment-Specific Filter Metadata on Categories

Categories must carry a `filterConfig JSONB` that defines which filters are available for products in this category. Without this, the frontend hardcodes filter options per segment — a maintenance catastrophe at 5+ segments.

```
Category.filterConfig JSONB example:
  TEXTILE (Sarees category):
  { 
    "filters": [
      { "field": "segmentAttributes.fabricComposition", "label": "Fabric", "type": "multiselect", "options": ["Silk", "Cotton", "Synthetic"] },
      { "field": "basePrice", "label": "Price Range", "type": "range" }
    ]
  }
  
  SPARE_PARTS (2-Wheeler Brakes category):
  {
    "filters": [
      { "field": "segmentAttributes.vehicleCompatibility", "label": "Vehicle", "type": "multiselect" },
      { "field": "basePrice", "label": "Price", "type": "range" }
    ]
  }
```

### MISSING-6: Product Version Tracking in AuditLog

As noted in MINOR-4, AuditLog entries for product updates must include the product version number. Currently missing from the spec.

### MISSING-7: SearchProductDocument Staleness Indicator

The API response for search results should include a `lastIndexedAt` timestamp from SearchProductDocument. This allows buyers to understand if a product price shown in search results was indexed in the last 60 seconds or 5 minutes ago. This is particularly important for B2B where prices change frequently.

---

## PART 8: BOUNDARY VIOLATIONS

### BOUNDARY-1: SearchModule Accessing Product Data

The current spec has SearchService performing additional data enrichment after the repository returns results. If this enrichment involves calling ProductsRepository directly (even read-only), it is a module boundary violation. SearchModule must operate exclusively via SearchRepository and the SearchProductDocument table, which is the denormalized search data store. Any product field not in SearchProductDocument must be added to SearchProductDocument, not fetched via cross-module DB access.

**Rule to add:** SearchModule is the only module that reads SearchProductDocument. Catalog/Products module is the only module that writes to SearchProductDocument. Never reverse these ownership rules.

### BOUNDARY-2: ProductOwnershipService Using PrismaService Directly

The draft has ProductOwnershipService resolving the Business record directly. If this crosses into the IdentityModule's data domain (Business is owned by IdentityModule since it's linked to User), this is a boundary violation. The ownership resolution must go through the exported `UsersRepository` or a dedicated `BusinessService` method from IdentityModule.

**Rule to add:** ProductsModule must not import BusinessRepository directly. It must import and use `BusinessQueryService` (a public service exported from IdentityModule) which abstracts the Business lookup. This boundary becomes critical when the Business model adds complexity (multi-business accounts, Phase 2).

### BOUNDARY-3: ImageProcessingWorker Using ProductsRepository

If the ImageProcessingWorker needs to update the Product record after image processing (e.g., to mark it as having processed images), it must not import ProductsRepository directly into the worker. Workers must communicate state changes via EventOutbox events or via direct DB updates limited to the Media model only. Product state changes triggered by image processing must come through the domain event consumer, not through direct repository access.

---

## PART 9: EVENTUAL CONSISTENCY REVIEW

### EC-1: SearchProductDocument Sync — Is It Truly Atomic?

The current spec writes SearchProductDocument in the same `$transaction` as the Product write. This is correct and guarantees that if the product is written, the SearchProductDocument is also updated. However:

**Risk:** The SearchProductDocument upsert in a transaction can fail with a row-level lock if the SearchReindexWorker is concurrently reading/writing the same row. In PostgreSQL, a transaction that includes a `WHERE productId=?` upsert and a concurrent SELECT from the same row will cause the upsert to block (not fail), but at high concurrency, this creates lock queue buildup.

**Fix:** Use `INSERT ... ON CONFLICT DO UPDATE` with a short lock timeout rather than Prisma's `upsert`. Set `lock_timeout = '500ms'` for search document updates. If timeout: log a warning and enqueue a SearchReindexJob for later sync.

### EC-2: EventOutbox Deduplication Key Fix

As noted in CRITICAL-5, the deduplication key must be deterministic. The final locked specification mandates:

```
ProductCreated event: deduplicationKey = product-created-${product.id}
  → Only one ProductCreated event per product lifetime
  → If re-created after deletion: product-created-${product.id}-v2
  
ProductUpdated event: deduplicationKey = product-updated-${product.id}-v${product.version}
  → One event per version (optimistic lock version)
  → Idempotent: same version = same event = deduplication catches it
  
ProductApproved event: deduplicationKey = product-approved-${product.id}
ProductDeleted event: deduplicationKey = product-deleted-${product.id}
```

### EC-3: SearchReindexJob Deduplication

The SearchReindexJob table uses `@@unique` on `(entityType, entityId)` — verified in schema v4.3. This means if a product is updated 5 times in quick succession, only ONE SearchReindexJob record exists (upsert). The worker processes it once. This is correct.

**Risk:** If the worker picks up the job BEFORE the 5th update completes, it indexes stale data. The `processedAt` is set to now, but the SearchProductDocument may be stale for 1-2 seconds until the 5th update's transaction commits.

**Mitigation:** After reindexing, the worker sets `processedAt` AND checks `SearchProductDocument.needsReindex`. If needsReindex is STILL true (another write happened during processing), the worker immediately re-enqueues. This is a "at-least-once with staleness check" pattern.

### EC-4: Cache Invalidation Is Async — Stale Reads Are Expected

The CacheInvalidationEvent is written in the transaction but processed asynchronously. This means a buyer could read a cached product detail page for up to 300 seconds after a price change. This is explicitly acceptable for B2B search (buyers refresh listings manually) but must be documented in the API response:

Add to product detail API response: `lastUpdatedAt: product.updatedAt` so buyers can see if the displayed data is recent.

---

## PART 10: SEARCH ARCHITECTURE REVIEW

### 10.1 GIN Index Strategy — Needs Async Write Decoupling

**Current:** The `product_search_trigger` fires BEFORE INSERT OR UPDATE ON Product. This means every product update that touches name or description causes synchronous GIN index update.

**Problem:** GIN index updates hold an exclusive lock on the index during the update. At high write concurrency, GIN index contention becomes a queue. At 1000+ concurrent product updates (bulk seller upload), this becomes a write bottleneck.

**Fix for Final Spec:**

```
REVISED TRIGGER STRATEGY:
  The trigger on Product does NOT update search_vector directly.
  Instead, it ONLY updates SearchProductDocument.needsReindex = true.
  
  The actual search_vector GIN index is maintained on SearchProductDocument.search_vector,
  NOT on Product.search_vector.
  
  SearchReindexWorker:
    1. Reads SearchProductDocument WHERE needsReindex = true
    2. Fetches latest Product data (name, description, segmentAttributes)
    3. Computes new search_vector via to_tsvector('simple', ...)
    4. Updates SearchProductDocument.search_vector + needsReindex = false
    
  GIN index: ON SearchProductDocument(search_vector), NOT on Product(search_vector)
  
  Product.search_vector column: DEPRECATED in favor of SearchProductDocument.search_vector
  The Unsupported("tsvector") on Product model: becomes tombstone field (kept for migration compatibility)
  
BENEFIT:
  - Product writes are fast (no GIN index lock)
  - Search index updates are batched and async
  - GIN index lives on SearchProductDocument (smaller table = faster index operations)
  - OpenSearch migration replaces SearchProductDocument (not Product) — clean separation
```

### 10.2 Search Ranking — Segment-Aware Boosting

The final locked spec mandates:

```
RANKING FORMULA (segment-aware, via SegmentSearchConfig):

Base ts_rank from SearchProductDocument.search_vector

Boosting multipliers (applied in application layer, not SQL):
  TEXTILE segment:
    isVerifiedSeller: × 1.3
    hasProcessedImages: × 1.2
    moq <= 6: × 1.1  (lower MOQ = more accessible = higher rank)
    
  SPARE_PARTS segment:
    isVerifiedSeller: × 1.4  (authenticity matters more in spare parts)
    hasOemCode: × 1.3
    hasImages: × 1.1

These multipliers are defined in SegmentSearchConfig.rankingBoosts (AppConfig JSONB)
and applied in SearchService AFTER the GIN query returns results.
No changes to SQL required when boosting rules change.
```

### 10.3 OpenSearch Migration Readiness — Must Be Hardened Now

The migration path from PostgreSQL GIN to OpenSearch must be lock-in-free from Sprint 2:

```
SEARCH SERVICE INTERFACE (define in Sprint 2, implement PostgreSQL in Sprint 2):

interface SearchEngine {
  search(params: SearchParams): Promise<SearchResult[]>
  suggest(query: string, segment: Segment): Promise<SearchSuggestion>
  index(product: SearchableProduct): Promise<void>
  deindex(productId: string): Promise<void>
  rebuildIndex(segment: Segment): Promise<void>
}

PostgresSearchEngine implements SearchEngine  ← Sprint 2
OpenSearchEngine implements SearchEngine      ← Phase 2

SearchService is injected with SearchEngine (via DI token SEARCH_ENGINE)
Swap implementation by changing DI provider — zero SearchService code changes

AppConfig: SEARCH_ENGINE_PROVIDER = 'postgres' | 'opensearch'
At startup: SearchModule reads AppConfig → registers appropriate engine

SearchProductDocument IS the canonical index store regardless of engine.
PostgresSearchEngine reads from it via SQL.
OpenSearchEngine reads from it to sync to OpenSearch index.
```

### 10.4 Query Plan Verification Requirements

Before Sprint 2 closes, the following EXPLAIN ANALYZE queries must be run and verified:

```sql
-- 1. GIN search must use index (not seq scan)
EXPLAIN ANALYZE
SELECT * FROM "SearchProductDocument"
WHERE segment = 'TEXTILE' AND search_vector @@ to_tsquery('simple', 'kurti')
LIMIT 20;
-- REQUIRED: Bitmap Index Scan on idx_spd_search_vector (create this)

-- 2. Trigram fuzzy must use index
EXPLAIN ANALYZE
SELECT * FROM "Product"
WHERE segment = 'TEXTILE' AND name ILIKE '%kurti%'
LIMIT 20;
-- REQUIRED: Bitmap Index Scan on idx_prod_name_trgm

-- 3. Category tree must use composite index
EXPLAIN ANALYZE
SELECT * FROM "Category"
WHERE segment = 'TEXTILE' AND is_active = true AND is_deleted = false;
-- REQUIRED: Index Scan on idx_cat_seg_active

-- 4. Product list must use composite index
EXPLAIN ANALYZE
SELECT * FROM "Product"
WHERE segment = 'TEXTILE' AND is_active = true AND is_deleted = false
ORDER BY created_at DESC, id DESC LIMIT 20;
-- REQUIRED: Index Scan on idx_prod_seg_cat_act
```

**All four must confirm index usage. Any Seq Scan blocks sprint close.**

### 10.5 Additional Required Index: SearchProductDocument GIN

The revised architecture moves the GIN search to SearchProductDocument. A new GIN index is required:

```sql
-- Add to the Sprint 0 migration file OR a new Sprint 2 migration:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spd_search_vector
  ON "SearchProductDocument" USING GIN ("search_vector")
  WHERE "needsReindex" = false;

-- Partial index: only index ready documents (not ones awaiting reindex)
-- This keeps the index smaller and faster during bulk updates
```

---

## PART 11: PRODUCT LIFECYCLE REVIEW

### 11.1 Status Transition Safety

The current draft defines valid transitions but does not enforce them at the repository or service layer. Any code path can call `updateStatus(id, ANY_STATUS)` without checking the current state. At Sprint 2 scale this is acceptable, but it will cause data corruption when Sprint 7 adds admin actions and Sprint 8 adds seller archiving.

**Required for final spec:** ProductStateMachine service:

```
ProductStateMachine:
  VALID_TRANSITIONS = {
    DRAFT: [PENDING_APPROVAL, ACTIVE],
    PENDING_APPROVAL: [ACTIVE, REJECTED],
    ACTIVE: [ARCHIVED, PENDING_APPROVAL],  // re-review on price change
    REJECTED: [DRAFT],
    ARCHIVED: [ACTIVE]
  }
  
  validateTransition(from: ProductStatus, to: ProductStatus, actorRole: UserRole): void
    → if (!VALID_TRANSITIONS[from].includes(to)) throw InvalidTransitionException
    → Certain transitions require admin role: PENDING_APPROVAL → ACTIVE requires admin or auto-approve
```

### 11.2 DRAFT Status Must Be Preserved

The current draft implies products go directly from creation to PENDING_APPROVAL or ACTIVE. There is no formal DRAFT state usage. The DRAFT state must be explicitly supported:

```
Seller creates product without publishing:
  POST /products { ...data, isDraft: true }
  → Product created with status: DRAFT
  → Not visible to buyers, not indexed in search
  
Seller publishes draft:
  POST /products/:id/publish
  → Runs approval logic → transitions to PENDING_APPROVAL or ACTIVE
  → ProductEventsService.emitProductCreated() fires at publish, not at draft creation

WHY: Large sellers with product catalogs need to prepare listings before going live.
Without DRAFT support, partial/invalid products get inadvertently indexed.
```

---

## PART 12: FINAL LOCKED SPECIFICATION — SPRINT 2 v2.0

Below is the authoritative final locked specification incorporating all audit findings. This replaces the Sprint 2 draft entirely.

---

### ARCHITECTURE ADDITIONS (Required vs. Draft)

The following are net-new architectural elements required by the audit. All draft content is preserved unless explicitly superseded.

---

#### A1. SegmentAttributeSchema System

**Add to Sprint 2 scope:**

```
PURPOSE: Enable unlimited future segment expansion without Product table pollution.

MODEL: SegmentAttributeSchema
  Fields: id, segment (Segment), version (Int), schema (JSONB), isActive, timestamps

SEED DATA (Sprint 2 seed):
  TEXTILE v1: { required: ["fabricComposition"], optional: ["gsm", "width", "weave"] }
  SPARE_PARTS v1: { required: ["partNumber"], optional: ["vehicleCompatibility", "oemCode"] }

VALIDATION INTEGRATION:
  ProductsService.createProduct():
    After Zod base validation →
    Load SegmentAttributeSchema for product.segment →
    JSON Schema validate dto.segmentAttributes against schema definition →
    If fails: throw ValidationException with field-level errors

SEARCH INTEGRATION:
  SearchReindexWorker computes search_vector:
    include name + description + flatten(segmentAttributes values) at appropriate weights

This model is an AppConfig-like entity with admin CRUD in Sprint 7.
Sprint 2: read-only, seeded.
```

---

#### A2. SegmentApprovalPolicy System

**Add to Sprint 2 scope:**

```
PURPOSE: Per-segment approval rules without conditional chaos.

MODEL: SegmentApprovalPolicy
  Fields: id, segment (Segment), policyType (Enum), minTrustScore (Int),
          requiredDocTypes (String[]), expiryDays (Int?), isActive, timestamps

SEED DATA (Sprint 2 seed):
  TEXTILE: { policyType: AUTO_APPROVE, minTrustScore: 0 }
  SPARE_PARTS: { policyType: AUTO_APPROVE, minTrustScore: 0 }

ProductApprovalService.getPolicy(segment: Segment): SegmentApprovalPolicy
  → DB lookup → cache in Redis: segment_approval_policy:{segment} TTL 300s

ProductApprovalService.determineInitialStatus(business, userRole, segment):
  → policy = getPolicy(segment)
  → if userRole in [ADMIN, SELLER_MANAGER]: return ACTIVE
  → if policy.policyType === AUTO_APPROVE && business.trustScore >= policy.minTrustScore: return ACTIVE
  → if policy.policyType === DOCUMENT_REQUIRED: check requiredDocTypes presence → return PENDING_APPROVAL
  → default: return PENDING_APPROVAL
```

---

#### A3. SegmentProductSchemaRegistry

**Add to Sprint 2 scope:**

```
PURPOSE: Segment-specific Zod validation without monolithic schema.

IMPLEMENTATION (service-layer only, no new DB model):
  BaseProductSchema: name, description, basePrice, mrp, moq, unit, categoryId, hsnCode, gstPercent, tags, mediaIds, segmentAttributes (JSONB passthrough)
  
  TextileProductSchema: extends BaseProductSchema, adds segment-specific constraints
  SparePartsProductSchema: extends BaseProductSchema, adds segment-specific constraints
  
  SegmentProductSchemaRegistry:
    register(segment: Segment, schema: ZodSchema): void
    get(segment: Segment): ZodSchema  ← throws if segment not registered
    validate(segment: Segment, data: unknown): { success, data?, errors? }

INITIAL REGISTRATIONS (Sprint 2):
  TEXTILE: TextileProductSchema
  SPARE_PARTS: SparePartsProductSchema

HOW TO ADD NEW SEGMENT:
  1. Create {Segment}ProductSchema.ts
  2. Register in SegmentProductSchemaRegistry constructor
  3. No other changes required
```

---

#### A4. SearchEngine Interface (OpenSearch Migration Readiness)

**Add to Sprint 2 scope:**

```
PURPOSE: DI-injectable search engine — swap PostgreSQL for OpenSearch without SearchService changes.

INTERFACE: SearchEngine
  Methods: search(), suggest(), index(), deindex(), rebuildIndex()

IMPLEMENTATIONS:
  PostgresSearchEngine ← Sprint 2 (uses $queryRaw on SearchProductDocument)
  OpenSearchEngine ← Phase 2

DEPENDENCY INJECTION:
  Token: SEARCH_ENGINE
  Provider: { provide: SEARCH_ENGINE, useClass: PostgresSearchEngine }
  Config-driven: AppConfig.SEARCH_ENGINE_PROVIDER

SearchService depends on: SEARCH_ENGINE token (not PostgresSearchEngine directly)
```

---

#### A5. ProductStateMachine

**Add to Sprint 2 scope:**

```
PURPOSE: Enforce valid product status transitions.

VALID_TRANSITIONS map: as defined in Section 11.1 above.

ProductStateMachine.validateTransition(from, to, actorRole):
  Called by: ProductApprovalService, ProductsService
  Throws: InvalidProductTransitionException with { from, to, reason }

PUBLISH WORKFLOW:
  POST /products/:id/publish
  → Validates DRAFT → PENDING_APPROVAL or DRAFT → ACTIVE transition
  → Fires approval logic
  → Emits ProductCreated event (not at draft creation)
```

---

#### A6. Revised EventOutbox Deduplication Keys

**Override draft spec:**

```
ProductCreated: deduplicationKey = product-created-${product.id}
ProductUpdated: deduplicationKey = product-updated-${product.id}-v${product.version}
ProductApproved: deduplicationKey = product-approved-${product.id}
ProductDeleted: deduplicationKey = product-deleted-${product.id}
MediaProcessed: deduplicationKey = media-processed-${media.id}

RULE: All deduplication keys are deterministic (no timestamps).
RULE: Version-scoped keys prevent duplicate update events at same version.
```

---

#### A7. SearchProductDocument as Primary Search Index

**Override draft spec — GIN index moves from Product to SearchProductDocument:**

```
Product.search_vector: DEPRECATED (kept in schema for migration safety, no trigger)
SearchProductDocument.search_vector: PRIMARY GIN search index

New GIN index required (add to Sprint 2 migration):
  CREATE INDEX CONCURRENTLY idx_spd_search_vector
  ON "SearchProductDocument" USING GIN (search_vector)
  WHERE needsReindex = false;

Product trigger: marks SearchProductDocument.needsReindex = true (fast, no GIN lock)
SearchReindexWorker: updates SearchProductDocument.search_vector + GIN updates (async)

Search queries target SearchProductDocument exclusively, never Product directly.
```

---

#### A8. Category.filterConfig JSONB

**Add to Sprint 2 scope:**

```
Category model already has metadata JSONB — repurpose as filterConfig.
OR: if metadata is reserved for other use, add filterConfig JSONB column in a Sprint 2 migration.

Seeded filter configurations for initial categories:
  Sarees: fabric type, occasion, price range
  Kurtis: size, fabric, price range
  2-Wheeler Brakes: vehicle make, vehicle model, price range
  Lubricants: viscosity, brand, price range

Frontend reads filterConfig from category detail API and renders appropriate filters.
Zero frontend code changes when new segment adds new filter types.
```

---

#### A9. ProductMedia.displayOrder

**Add to Sprint 2 scope:**

```
Verify: ProductMedia model in schema v4.3 — check if displayOrder column exists.
If missing: Sprint 2 schema migration (backward compatible — nullable Int column with default 0).

ProductsService.createProduct(): assign displayOrder in order of mediaIds array.
MediaController.reorderMedia() endpoint stub: Sprint 5 implementation, Sprint 2 API contract only.
```

---

#### A10. Typed Search Suggestions API

**Override draft spec — stub must return typed structure:**

```
SearchSuggestionResponse:
  queries: string[]        ← popular/recent queries matching prefix
  categories: [{ id, name, slug, segment }]  ← matching category names
  products: [{ id, name, slug, thumbnailUrl }]  ← matching product names (top 3)

Sprint 2 stub: all arrays empty if query < 3 chars, categories populated from cache
Sprint 6: queries populated from SearchAnalytics
```

---

#### A11. MediaClassification on Media Model

**Add to Sprint 2 scope:**

```
Media.mediaClass: Enum: PRODUCT_IMAGE | COMPLIANCE_DOCUMENT | SWATCH | SPEC_SHEET | CAD_FILE
  Default: PRODUCT_IMAGE

SegmentAttributeSchema.requiredMedia: JSON definition of required media classes per segment
Sprint 2 seed: both TEXTILE and SPARE_PARTS require min 1 PRODUCT_IMAGE

MediaValidationService.validateForSegment(mediaIds, segment):
  Called by ProductsService before product submission
  Sprint 2: validates PRODUCT_IMAGE count (min 1)
  Future: validates COMPLIANCE_DOCUMENT requirements for Pharma, Electronics
```

---

### FINAL CONSOLIDATED SPRINT 2 IMPLEMENTATION PHASES

```
PHASE 1: Shared Types + Schema Extensions
  1.1 Add ProductStatus, MediaType, ProductMediaClass enums to packages/types
  1.2 Add CreateProductSchema, UpdateProductSchema, ProductSearchSchema to packages/types
  1.3 Add SegmentProductSchemaRegistry scaffolding to packages/types
  1.4 Define SearchEngine interface in packages/types
  1.5 Define typed SearchSuggestionResponse in packages/types
  1.6 Sprint 2 migration: Category.filterConfig, ProductMedia.displayOrder,
      Media.mediaClass, SegmentAttributeSchema table, SegmentApprovalPolicy table
  1.7 GIN index on SearchProductDocument (idx_spd_search_vector)
  
PHASE 2: Category Module
  2.1 CategoryRepository (segment-scoped, Redis cache-aside)
  2.2 CategoryService (tree + filterConfig included in response)
  2.3 CategoryController (GET /categories, GET /categories/:id)
  2.4 Category + filterConfig seed data

PHASE 3: Media Module
  3.1 StorageService interface + S3StorageService + LocalStorageService (for dev)
  3.2 ImageValidatorService (MIME + magic bytes + size + dimensions)
  3.3 MediaClassificationService (validate mediaClass requirements per segment)
  3.4 MediaRepository (create, findByChecksum, markProcessed, softDelete, findOrphaned)
  3.5 MediaService (upload orchestration, duplicate detection, async processing trigger)
  3.6 MediaController (POST /media/upload, DELETE /media/:id)
  3.7 ImageProcessingWorker (async WebP variant generation)

PHASE 4: Segment Infrastructure
  4.1 SegmentAttributeSchema seed + SegmentAttributeSchemaRepository
  4.2 SegmentApprovalPolicy seed + SegmentApprovalPolicyRepository
  4.3 SegmentProductSchemaRegistry (TextileProductSchema, SparePartsProductSchema)
  4.4 ProductStateMachine (validate transitions)
  4.5 MediaClassificationService integration with SegmentAttributeSchema

PHASE 5: Product Module
  5.1 ProductRepository (all queries segment-scoped, cursor pagination)
  5.2 ProductOwnershipService (two-hop ownership, cached business lookup)
  5.3 ProductApprovalService (reads SegmentApprovalPolicy, ProductStateMachine)
  5.4 ProductEventsService (deterministic deduplication keys, all within $transaction)
  5.5 ProductsService (orchestration: ownership → schema validation → segment attr validation → approval → transaction)
  5.6 ProductsController (CRUD + /seller/products + /products/:id/publish)

PHASE 6: Search Module
  6.1 SearchNormalizerService (synonym expansion, tsquery building)
  6.2 SearchCacheService (segment-scoped keys, admin-scoped keys)
  6.3 SearchRepository (PostgresSearchEngine implements SearchEngine interface)
  6.4 SearchReindexWorker (async GIN update on SearchProductDocument)
  6.5 SearchService (engine injection, segment-aware ranking, analytics logging)
  6.6 SearchController (GET /search/products, GET /search/suggestions typed response)

PHASE 7: Module Wiring
  7.1 CatalogModule assembly
  7.2 AppModule update (add CatalogModule)
  7.3 IdentityModule exports update (BusinessQueryService)
  7.4 Permission registry verification

PHASE 8: Seed Data
  8.1 Category trees (TEXTILE + SPARE_PARTS) with filterConfig
  8.2 SegmentAttributeSchema seed
  8.3 SegmentApprovalPolicy seed
  8.4 Search synonym AppConfig seed
  8.5 SegmentSearchConfig AppConfig seed

PHASE 9: Frontend
  9.1 Search API client (typed, SearchEngine interface-compatible)
  9.2 Buyer search results page (segment-aware filter rendering from filterConfig)
  9.3 Buyer product detail page (segmentAttributes display)
  9.4 Seller product list (status tabs)
  9.5 Seller product create form (segment-aware attribute fields from SegmentAttributeSchema)

PHASE 10: Testing
  10.1 Segment isolation tests (MANDATORY)
  10.2 GIN + EXPLAIN ANALYZE verification (MANDATORY)
  10.3 SegmentProductSchemaRegistry tests
  10.4 ProductStateMachine transition tests
  10.5 Ownership security tests
  10.6 EventOutbox idempotency tests (deduplication key uniqueness)
  10.7 SearchEngine interface contract tests

PHASE 11: Observability
  11.1 CatalogMetrics (product_created_total, search_query_total, search_cache_hit_rate)
  11.2 search_gin_index_size_bytes metric (alert at 500MB)
  11.3 Grafana alert: search p95 > 150ms

PHASE 12: Staging Deployment + Verification
  12.1 Run migrations (SegmentAttributeSchema, SegmentApprovalPolicy, Category.filterConfig)
  12.2 Run seed
  12.3 Run EXPLAIN ANALYZE verification suite
  12.4 Manual verification of all 18 segments isolation test cases
  12.5 CURRENT_PHASE.md update
```

---

### FINAL VALIDATION GATE ADDITIONS (Supplement to Draft Gate)

The following items are added to the Sprint 2 validation gate beyond what the draft specified:

```
SEGMENT ARCHITECTURE
✅ SegmentAttributeSchema table seeded for TEXTILE + SPARE_PARTS
✅ Product create with invalid segmentAttributes → 400 VALIDATION_ERROR
✅ Product create with valid segmentAttributes → stored in product.segmentAttributes JSONB
✅ SegmentApprovalPolicy table seeded for TEXTILE + SPARE_PARTS (AUTO_APPROVE)
✅ Adding new segment requires ZERO code changes (verified by attempting MOCK segment config)

PRODUCT LIFECYCLE
✅ POST /products (no isDraft flag) → DRAFT status
✅ POST /products/:id/publish → status transitions to PENDING_APPROVAL or ACTIVE
✅ Invalid transition attempt → 422 INVALID_TRANSITION
✅ ProductStateMachine.validateTransition tested for all valid/invalid paths

SEARCH ARCHITECTURE
✅ GIN index is on SearchProductDocument.search_vector (NOT Product.search_vector)
✅ Product write does NOT lock GIN index (verified via concurrent write test)
✅ SearchReindexWorker processes needsReindex=true records correctly
✅ SearchEngine interface is injected (verify PostgresSearchEngine injected via DI token)
✅ search_gin_index_size_bytes metric emitted

EVENTOUTBOX CONSISTENCY
✅ ProductCreated deduplication key is deterministic (product-created-${productId})
✅ Retry of same product create does NOT create duplicate EventOutbox entry
✅ ProductUpdated deduplication key is version-scoped
✅ SearchReindexJob.upsert on product update (not create — no duplicates)

MEDIA GOVERNANCE
✅ Media.mediaClass = PRODUCT_IMAGE for standard uploads
✅ MediaValidationService rejects product without min 1 PRODUCT_IMAGE
✅ Category.filterConfig populated for all seeded categories
✅ Frontend renders filters from filterConfig, not hardcoded list

MODULE BOUNDARIES
✅ SearchModule does NOT import ProductRepository (verify via dependency graph check)
✅ ProductsModule imports BusinessQueryService from IdentityModule (not BusinessRepository directly)
✅ ImageProcessingWorker does NOT import ProductRepository
```

---

## SECTION 12: FINAL VERDICT

```
VERDICT: READY WITH PATCHES
```

**Reasoning:**

The Sprint 2 draft is architecturally competent for MVP delivery of a two-segment B2B marketplace. The core patterns — segment isolation, EventOutbox, async media pipeline, cursor pagination, search fallback — are correctly designed and will function reliably for the initial TEXTILE and SPARE_PARTS segments.

However, the draft contains three categories of issues that, if not patched before implementation begins, will cause irreversible architectural damage within 12–18 months:

**Category A — Will cause data model rewrites (MUST patch):**
- Missing SegmentAttributeSchema system (REWRITE-1)
- Missing SegmentApprovalPolicy (REWRITE-3)
- Missing SegmentProductSchemaRegistry (REWRITE-2)

**Category B — Will cause search architecture rewrites (MUST patch):**
- GIN index on Product instead of SearchProductDocument (affects OpenSearch migration, SCALE-1)
- Non-injectable SearchEngine interface (blocks clean OpenSearch migration, REWRITE-4)

**Category C — Will cause silent data corruption (MUST patch):**
- EventOutbox deduplication key with timestamp (CRITICAL-5)
- No ProductStateMachine enforcement (PART 11.1)
- ProductMedia.displayOrder missing (MISSING-3)

**The patches defined in this audit document are:**
- Architecturally minimal (no sprints of additional work)
- Implementation-ready (fully specified)
- Non-disruptive to the draft's core design

With these patches incorporated into the implementation phase, Sprint 2 will produce a segment-extensible, search-scalable, operationally sound marketplace foundation capable of supporting 10+ future segments without major rewrites.

**The implementation team MUST NOT begin Sprint 2 coding from the draft version.** They must begin from this final locked specification (v2.0). The implementation agents in Antigravity should receive this document as the authoritative Sprint 2 specification, with the draft treated as background context only.

**Post-patch confidence: PRODUCTION-READY for initial two segments. ARCHITECTURE-READY for unlimited future segment expansion.**
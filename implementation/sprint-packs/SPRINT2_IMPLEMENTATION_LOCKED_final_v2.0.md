# VYAPARNET — SPRINT 2 FINAL IMPLEMENTATION PACK
## Marketplace Core Foundation
### Version: v2.0 FINAL LOCK | Post-Audit Hardened
### Authority: All Architecture Documents + Master Context Pack + Audit v2.0
### Date: 2026-05-27 | Preceded by: Sprint 1 (Authentication & Identity — COMPLETE)

> **CRITICAL:** This is the v2.0 post-audit specification. The previous v1.0 draft is SUPERSEDED entirely.
> All implementation agents MUST use this document. The audit identified six critical architectural
> gaps in v1.0 that, if unpatched, would cause irreversible rewrites within 12–18 months.
> These are fully resolved here.

---

## SECTION 1: SPRINT IDENTITY

| Field | Value |
|---|---|
| Sprint Number | 2 |
| Sprint Name | Marketplace Core Foundation |
| Spec Version | v2.0 (Post-Audit Final Lock) |
| Duration | 2 weeks (10 working days) |
| Status | READY TO EXECUTE (Sprint 1 gate must be fully passed) |
| Preceded By | Sprint 1 — Authentication & Identity (ALL validation gates must pass) |
| Followed By | Sprint 3 — Inventory Management |
| Critical Path | Yes — Inventory (Sprint 3) requires Product.id; Orders (Sprint 4) require Product.basePrice |

---

## SECTION 2: REQUIRED ARCHITECTURE CONTEXT FILES

Every AI agent and engineer executing Sprint 2 MUST read these files before writing a single line.

| Context Type | Authoritative File | Why Required |
|---|---|---|
| Schema — Catalog Domain | `architecture/database/VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` | Category, Product, ProductVariant, ProductMedia, Media, SearchProductDocument models |
| Indexing Strategy | `architecture/database/VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — Sections 6.2, 7, 8 | GIN index strategy, search hot path, partial indexes |
| DB Infra — Search | `architecture/database/VyaparNet_DB_Infra_Architecture.md` — Sections 4, 2 | FTS implementation, segment isolation, trigger SQL |
| Module Architecture | `architecture/modules/VyaparNet_Module_Breakdown_Final_Enterprise_Freeze_v2.docx` — Modules 2, 3, 8 | Catalog Engine, Search Engine boundaries, event contracts |
| Implementation Patterns | `architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Sections 3, 4, 5, 13, 14, 15 | Repository pattern, service/use-case layer, outbox, caching, search indexing |
| API Contracts | `architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — Section 4 | Product CRUD DTOs, search query params, file upload |
| Workflow Sequences | `architecture/workflows/VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Sections 3, 4, 21, 22 | Product creation flow, search workflow, search rebuild, cache failure |
| Runtime | `architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md` — Sections 7, 9 | CDN/asset delivery, Redis cache governance, image pipeline |
| Governance | `context/LOCKED_DECISIONS.md` | Module boundaries, forbidden patterns, naming |
| Project Context | `context/PROJECT_CONTEXT.md` | Anti-patterns, AI rules, runtime guarantees |
| Sprint Authority | `implementation/master-roadmap/MASTER_IMPLEMENTATION_ROADMAP.md` — Sprint 2 | Deliverables, validation gate |
| Sprint 1 | `implementation/sprints/SPRINT_1.md` | Auth infrastructure, guard patterns |
| PRD | `architecture/prd/VyaparNet_PRDv2_Final_Freeze.docx` — Sections 13, 20 | Database foundations, segment isolation principles |

---

## SECTION 3: V2.0 AUDIT DELTA — WHAT CHANGED FROM v1.0

The following are net-new architectural elements introduced by the Enterprise Architecture Audit. All v1.0 content is preserved unless explicitly superseded below.

| Change | Type | Impact |
|---|---|---|
| SegmentAttributeSchema system | NET NEW — Critical | Enables unlimited segment expansion without Product table pollution |
| SegmentApprovalPolicy model | NET NEW — Critical | Per-segment approval rules replace single platform threshold |
| SegmentProductSchemaRegistry | NET NEW — Critical | Segment-aware Zod validation without monolithic schema |
| SearchEngine DI interface | NET NEW — Critical | Clean OpenSearch migration path, zero SearchService changes |
| GIN index moved to SearchProductDocument | SUPERSEDES v1.0 | Product writes no longer lock GIN index; async reindex only |
| EventOutbox deduplication keys | SUPERSEDES v1.0 | Deterministic keys (no timestamps) — idempotent retries |
| ProductStateMachine | NET NEW | Enforces valid status transitions, prevents silent data corruption |
| MediaClassification enum | NET NEW | mediaClass field on Media model; segment-aware document requirements |
| Category.filterConfig JSONB | NET NEW | Frontend renders filters from config, never hardcoded |
| ProductMedia.displayOrder | NET NEW | Deterministic primary image — non-negotiable |
| Typed SearchSuggestionResponse | SUPERSEDES v1.0 | Prevents breaking API change in Sprint 6 |
| Search cache scope key | SUPERSEDES v1.0 | Prevents admin results leaking to buyer-scoped cache |
| SearchProductDocument.lastIndexedAt in API | NET NEW | Buyers can see data recency |

---

## SECTION 4: SPRINT OBJECTIVE

Sprint 2 establishes the commercial heart of VyaparNet. At the end of Sprint 2:

- Sellers can create, manage, and publish products with images
- Buyers can search products using fast PostgreSQL GIN full-text search with Hinglish fuzzy matching
- Every product is segment-isolated — a TEXTILE buyer never sees SPARE_PARTS products
- Product approval workflow operates per-segment policy (not a single platform threshold)
- Product images are classified (PRODUCT_IMAGE, SWATCH, SPEC_SHEET, etc.) and processed asynchronously
- The search index (SearchProductDocument) is maintained via async worker — Product writes are never locked by GIN updates
- All product mutations emit domain events to the EventOutbox with deterministic deduplication keys
- Both buyer-facing search/discovery UI and seller product management UI are functional
- Adding a new segment in the future requires ZERO application code changes

**Sprint 2 does NOT implement:**
- Inventory reservation or stock levels (Sprint 3)
- Cart or order placement (Sprint 4)
- Supplier offers beyond base price (Sprint 7)
- Product reviews or ratings (Sprint 5)
- OpenSearch migration (Phase 2)
- Bulk CSV product upload (Phase 2)

---

## SECTION 5: ARCHITECTURAL PRINCIPLES

### 5.1 Absolute Constraints (Never Violate)

```
1. Segment isolation is absolute.
   Every buyer-facing product query must carry a segment filter enforced at the repository layer.
   A query returning cross-segment results is a critical security bug.

2. Seller ownership is two-hop and server-enforced.
   Product.businessId → Business.ownerId → User.id.
   Verified server-side on every mutation. Client cannot override.

3. Search uses `simple` tsvector dictionary, not `english`.
   English dictionary breaks Hinglish term matching. simple preserves exact words.

4. EventOutbox write is atomic with product write.
   EventOutbox + SearchReindexJob + SearchProductDocument in the SAME $transaction.

5. GIN index updates are NEVER synchronous on product write.
   Product trigger: marks SearchProductDocument.needsReindex = true ONLY.
   Actual GIN rebuild: SearchReindexWorker (async).

6. No if (segment === 'x') conditional chains. Ever.
   Use registry/policy pattern: SegmentProductSchemaRegistry, SegmentApprovalPolicy.

7. No segment-specific columns on Product table.
   All segment-specific attributes live in Product.segmentAttributes JSONB,
   validated against SegmentAttributeSchema.

8. No OFFSET pagination.
   Cursor-only on (createdAt DESC, id DESC).

9. All $queryRaw uses Prisma.sql template tag. Never string interpolation.

10. S3 keys are UUID-based: media/{userId}/{productId}/{uuid}.{ext}. Never original filename.
```

### 5.2 Segment Isolation Architecture

```
ENFORCEMENT LAYERS:
  Repository: segment parameter required on all buyer-facing methods
  Service: validates segment match before returning product
  Cache: cache key includes {segment} AND {scope: buyer|admin}
  Search: SearchProductDocument.segment filter on every query


CROSS-SEGMENT ACCESS:
  Allowed: ADMIN role (explicit, documented, logged)
  Forbidden: BUYER, SELLER — enforced in repository, not optional

CACHE KEY PATTERN:
  search:v1:{scope}:{segment}:{queryHash}
  where scope = 'buyer' | 'admin'
  REASON: Admin cross-segment results must never be served to buyers.
```
### 5.3 SegmentSearchConfig Governance

Each segment MUST maintain its own:
`SegmentSearchConfig`.

Purpose:
prevent hardcoded search/ranking chaos as future segments scale.

Each `SegmentSearchConfig` MUST define:

- searchable fields
- ranking weights
- searchable attributes
- allowed filters
- normalization rules
- synonym rules
- autocomplete behavior
- typo tolerance rules
- default sorting rules
- relevance scoring strategy
- future OpenSearch compatibility rules

Examples:

TEXTILE:
- prioritize freshness + images + MOQ

PHARMA:
- prioritize compliance + verification + expiry validity

ELECTRONICS:
- prioritize specification completeness + compatibility

INDUSTRIAL:
- prioritize RFQ relevance + technical metadata

Search behavior MUST remain:
segment-configurable.

Hardcoded:
`if (segment === x)`
search branching across services is STRICTLY FORBIDDEN.

Ownership:
`packages/domain/segment-config`

Future OpenSearch migration MUST preserve:
SegmentSearchConfig abstraction boundaries.

### 5.3.1 Segment Schema Versioning Governance

Segment schemas MUST support long-term evolution without breaking existing products.

Each segment schema MUST contain:

- schemaVersion
- migration compatibility rules
- deprecated field metadata
- validation upgrade strategy
- fallback parsing behavior

Example:

TEXTILE schema:
v1:
- gsm
- weave

v2:
- gsm
- weave
- shrinkagePercentage

Existing v1 products MUST remain readable after v2 rollout.

RULES:

1. Schema upgrades MUST be backward compatible whenever possible.

2. Existing products MUST NOT become unreadable after schema evolution.

3. Validation MUST support controlled migration windows.

4. Deprecated fields MUST be soft-deprecated first before removal.

5. Segment schema migrations MUST be asynchronous and resumable.

6. Search indexing MUST tolerate mixed-version documents during migration windows.

7. Segment schema evolution MUST NOT require Product table rewrites.

Ownership:
`SegmentProductSchemaRegistry`

Future segment additions MUST remain:
configuration-driven,
NOT migration-chaos driven.

### 5.3.2 Search Indexing SLA Governance

Search indexing architecture MUST explicitly define eventual consistency expectations.

Search indexing is:
eventually consistent,
NOT strongly synchronous.

TARGET SLA:

- 95% of product updates searchable within 30 seconds
- 99% of product updates searchable within 2 minutes

This SLA applies to:

- product creation
- product updates
- approval-state changes
- inventory visibility changes
- media updates
- category changes
- segment metadata updates

RULES:

1. API write latency MUST NOT depend on synchronous search indexing.

2. Search indexing MUST remain asynchronous through:
`EventOutbox → SearchReindexWorker`.

3. Temporary search staleness during worker backlog conditions is acceptable within SLA limits.

4. Search indexing failures MUST be retry-safe and idempotent.

5. Failed indexing events MUST enter:
dead-letter retry workflows.

6. Operational monitoring MUST track:

- indexing latency
- queue backlog
- indexing failure rates
- stale document percentage
- retry frequency

7. Future OpenSearch migration MUST preserve SLA guarantees.

Search consistency philosophy:
eventual consistency with operational observability.

### 5.3.3 Segment Deprecation & Cleanup Governance

The platform MUST support safe long-term segment deprecation without orphaned system state.

Future deprecated segments MAY include:
- retired business categories
- unsupported industries
- merged procurement domains
- legacy experimental segments

RULES:

1. Segment deprecation MUST occur through controlled lifecycle states:

- ACTIVE
- DEPRECATED
- READ_ONLY
- ARCHIVED
- REMOVED

2. Deprecated segments MUST block:
- new product creation
- new RFQ creation
- new category creation

while still preserving:
- historical access
- audit visibility
- reporting compatibility

3. Segment removal MUST include cleanup workflows for:

- SegmentAttributeSchema
- SegmentProductSchemaRegistry
- SegmentApprovalPolicy
- SearchProductDocument
- category filterConfig
- media classification rules
- validation rules
- search configs
- orphaned cache keys

4. Cleanup workflows MUST be:
- resumable
- idempotent
- observable
- retry-safe

5. Historical audit records MUST NEVER be deleted during segment cleanup.

6. Product archival MUST remain recoverable during:
DEPRECATED and READ_ONLY states.

7. Future OpenSearch migration MUST preserve:
segment archival semantics.

8. Segment cleanup MUST NOT require:
Product table rewrites.

Ownership:
`SegmentLifecycleGovernance`

Future segment expansion and retirement MUST remain:
configuration-governed,
NOT operationally chaotic.

### 5.4 Product Ownership Model

```
OWNERSHIP CHAIN:
  User.id → Business.ownerId → Business.id → Product.businessId

VERIFICATION (ProductOwnershipService):
  resolveSellerBusiness(userId) → Business (cached: seller_business:{userId} TTL 300s)
  verifyProductOwnership(userId, productId) → { product, business }
    if product.businessId !== business.id → throw Forbidden

WHY: Prevents privilege escalation if a user has multiple businesses in future.
     Server-side only — client cannot supply businessId.
```

### 5.5 Segment Attribute Architecture (v2.0 — Critical Addition)

```
PROBLEM SOLVED: Prevents Product table pollution with segment-specific nullable columns.

MODEL: SegmentAttributeSchema
  id, segment (Segment), version (Int), schema (JSONB), isActive, timestamps

  schema JSONB example — TEXTILE:
  {
    "required": ["fabricComposition"],
    "optional": ["gsm", "width", "weave", "finish"],
    "properties": {
      "fabricComposition": { "type": "string", "maxLength": 200 },
      "gsm": { "type": "number", "min": 50, "max": 2000 },
      "width": { "type": "number", "unit": "cm" }
    }
  }

  schema JSONB example — SPARE_PARTS:
  {
    "required": ["partNumber"],
    "optional": ["vehicleCompatibility", "oemCode", "brandName"],
    "properties": {
      "partNumber": { "type": "string", "pattern": "^[A-Z0-9-]+$" },
      "vehicleCompatibility": { "type": "array", "items": { "type": "string" } }
    }
  }

Product.segmentAttributes JSONB:
  Stores actual attribute values for this product's segment.
  Validated in ProductsService against SegmentAttributeSchema.schema at creation.

  Example (TEXTILE product):
  { "fabricComposition": "65% Polyester 35% Cotton", "gsm": 180, "width": 44 }

HOW TO ADD NEW SEGMENT (e.g. PHARMA):
  1. Add PHARMA to Segment enum (schema migration required)
  2. Insert SegmentAttributeSchema seed for PHARMA
  3. Register PharmaProductSchema in SegmentProductSchemaRegistry
  4. Zero other code changes

SEARCH INTEGRATION:
  SearchReindexWorker includes flattened segmentAttributes values in search_vector computation.
  Textile search naturally finds fabric composition terms. Spare parts search finds part numbers.
```

### 5.6 Per-Segment Approval Policy (v2.0 — Critical Addition)

```
MODEL: SegmentApprovalPolicy
  id, segment (Segment), policyType (Enum), minTrustScore (Int),
  requiredDocTypes (String[]), expiryDays (Int?), isActive, timestamps

  policyType Enum: AUTO_APPROVE | MANUAL_REVIEW | DOCUMENT_REQUIRED | COMPLIANCE_CHECK

SEED (Sprint 2):
  TEXTILE:     { policyType: AUTO_APPROVE, minTrustScore: 0 }
  SPARE_PARTS: { policyType: AUTO_APPROVE, minTrustScore: 0 }

FUTURE (no code changes needed):
  PHARMA:      { policyType: DOCUMENT_REQUIRED, requiredDocTypes: ['DRUG_LICENSE', 'FSSAI_CERT'], expiryDays: 365 }
  ELECTRONICS: { policyType: DOCUMENT_REQUIRED, requiredDocTypes: ['CE_MARKING', 'BIS_CERT'] }

ProductApprovalService.determineInitialStatus(business, userRole, segment):
  → policy = getPolicy(segment)  [cached: segment_approval_policy:{segment} TTL 300s]
  → if userRole in [ADMIN, SELLER_MANAGER]: return ACTIVE
  → if policy.policyType === AUTO_APPROVE && business.trustScore >= policy.minTrustScore: return ACTIVE
  → if policy.policyType === DOCUMENT_REQUIRED: check requiredDocTypes → return PENDING_APPROVAL
  → default: return PENDING_APPROVAL
```

### 5.7 Segment Validation Registry (v2.0 — Critical Addition)

```
SegmentProductSchemaRegistry (service-layer, no DB model):

  private schemas: Map<Segment, ZodSchema>

  register(segment: Segment, schema: ZodSchema): void
  get(segment: Segment): ZodSchema   ← throws if segment not registered (fail-fast)
  validate(segment: Segment, data: unknown): { success, data?, errors? }

BASE SCHEMA (fields common to ALL segments):
  name, description, basePrice, mrp, moq, unit, categoryId,
  hsnCode, gstPercent, tags, mediaIds, segmentAttributes (JSONB passthrough)

SEGMENT SCHEMAS (extend base):
  TextileProductSchema — adds textile-specific constraints on segmentAttributes
  SparePartsProductSchema — adds spare-parts-specific constraints

REGISTRATION (Sprint 2, in SegmentProductSchemaRegistry constructor):
  TEXTILE → TextileProductSchema
  SPARE_PARTS → SparePartsProductSchema

ProductsService.createProduct():
  const schema = schemaRegistry.get(dto.segment)
  const result = schema.safeParse(dto)
  if (!result.success) throw ValidationException(result.error)
```

### 5.8 SearchEngine Abstraction (v2.0 — Critical Addition)

```
INTERFACE: SearchEngine (DI token: SEARCH_ENGINE)
  search(params: SearchParams): Promise<SearchResult[]>
  suggest(query: string, segment: Segment): Promise<SearchSuggestionResponse>
  index(product: SearchableProduct): Promise<void>
  deindex(productId: string): Promise<void>
  rebuildIndex(segment: Segment): Promise<void>

IMPLEMENTATIONS:
  PostgresSearchEngine implements SearchEngine  ← Sprint 2
  OpenSearchEngine implements SearchEngine      ← Phase 2

DI PROVIDER:
  { provide: SEARCH_ENGINE, useClass: PostgresSearchEngine }
  Config-driven: AppConfig.SEARCH_ENGINE_PROVIDER = 'postgres' | 'opensearch'

SearchService depends ONLY on SEARCH_ENGINE token, never on PostgresSearchEngine directly.
Swapping engines = change one DI provider registration. Zero SearchService changes.
```

### 5.9 Revised GIN Index Strategy (v2.0 — Supersedes v1.0)

```
V1.0 (WRONG): GIN index on Product.search_vector, updated via trigger on every Product write.
  → Problem: GIN index holds exclusive lock during updates. High-concurrency writes stall.

V2.0 (CORRECT): GIN index on SearchProductDocument.search_vector only.

PRODUCT WRITE TRIGGER (lightweight):
  Marks SearchProductDocument.needsReindex = true ONLY.
  No tsvector computation. No GIN index lock. Fast.

SearchReindexWorker (async):
  Reads SearchProductDocument WHERE needsReindex = true
  Fetches Product data (name, description, segmentAttributes)
  Computes to_tsvector('simple', combined_text)
  Updates SearchProductDocument.search_vector + needsReindex = false
  GIN index updated here — async, batched, no impact on product write latency

Product.search_vector column: DEPRECATED (kept in schema for migration safety, no trigger)

NEW GIN INDEX (add to Sprint 2 migration):
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spd_search_vector
  ON "SearchProductDocument" USING GIN (search_vector)
  WHERE needsReindex = false;

BENEFIT: OpenSearch migration replaces SearchProductDocument read path.
  No Product table changes required for migration.
```

### 5.10 EventOutbox Deduplication Keys (v2.0 — Supersedes v1.0)

```
V1.0 (WRONG): deduplicationKey = product-${product.id}-created-${Date.now()}
  → Problem: timestamp changes on retry → duplicate events emitted

V2.0 (CORRECT): All keys are deterministic (no timestamps):

  ProductCreated:  product-created-${product.id}
  ProductUpdated:  product-updated-${product.id}-v${product.version}
  ProductApproved: product-approved-${product.id}
  ProductDeleted:  product-deleted-${product.id}
  MediaProcessed:  media-processed-${media.id}

GUARANTEE: Retry of same operation at same version = same key = deduplication catches it.
```

### 5.11 Product State Machine (v2.0 — New)

```
ProductStateMachine (enforces valid transitions):

VALID_TRANSITIONS:
  DRAFT            → [PENDING_APPROVAL, ACTIVE]
  PENDING_APPROVAL → [ACTIVE, REJECTED]
  ACTIVE           → [ARCHIVED, PENDING_APPROVAL]   // re-review on significant price change
  REJECTED         → [DRAFT]
  ARCHIVED         → [ACTIVE]

validateTransition(from: ProductStatus, to: ProductStatus): void
  if (!VALID_TRANSITIONS[from].includes(to)) throw InvalidProductTransitionException({ from, to })

PUBLISH WORKFLOW:
  POST /products/:id/publish
  → validateTransition(DRAFT, PENDING_APPROVAL or ACTIVE)
  → runs approval logic
  → fires ProductCreated event (NOT at draft creation — only at publish)

WHY: ProductCreated event signals the product is commercially visible.
     A DRAFT is not yet a commercial event.
```

### 5.12 MediaClassification (v2.0 — New)

```
Media.mediaClass Enum: PRODUCT_IMAGE | COMPLIANCE_DOCUMENT | SWATCH | SPEC_SHEET | CAD_FILE
  Default: PRODUCT_IMAGE

SegmentAttributeSchema.requiredMedia (in schema JSONB):
  TEXTILE: { requiredMedia: [{ class: "PRODUCT_IMAGE", min: 1, max: 10 }] }
  PHARMA (future): { requiredMedia: [
    { class: "PRODUCT_IMAGE", min: 1, max: 10 },
    { class: "COMPLIANCE_DOCUMENT", subtypes: ["DRUG_LICENSE"], required: true }
  ]}

MediaValidationService.validateForSegment(mediaIds, segment):
  Sprint 2: validates PRODUCT_IMAGE count (min 1)
  Future: validates COMPLIANCE_DOCUMENT requirements per SegmentAttributeSchema

Called by ProductsService before product submission. Blocks if required media missing.
```

---

## SECTION 6: SCHEMA ADDITIONS (v2.0 — Sprint 2 Migration)

The following additions to the Prisma schema are required in Sprint 2. All are backward-compatible.

```
NEW MODELS:

model SegmentAttributeSchema {
  id        String   @id @default(cuid())
  segment   Segment
  version   Int      @default(1)
  schema    Json
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([segment, version])
  @@map("segment_attribute_schemas")
}

model SegmentApprovalPolicy {
  id               String   @id @default(cuid())
  segment          Segment  @unique
  policyType       ApprovalPolicyType
  minTrustScore    Int      @default(0)
  requiredDocTypes String[]
  expiryDays       Int?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@map("segment_approval_policies")
}

NEW ENUMS:

enum ApprovalPolicyType {
  AUTO_APPROVE
  MANUAL_REVIEW
  DOCUMENT_REQUIRED
  COMPLIANCE_CHECK
}

enum MediaClass {
  PRODUCT_IMAGE
  COMPLIANCE_DOCUMENT
  SWATCH
  SPEC_SHEET
  CAD_FILE
}

ADDITIONS TO EXISTING MODELS:

Product:
  segmentAttributes Json?   @default("{}")  // replaces/formalizes metadata JSONB
  (verify schema v4.3 — if metadata exists, rename/repurpose)

ProductMedia:
  displayOrder Int @default(0)
  (verify schema v4.3 — add migration if missing)

Media:
  mediaClass MediaClass @default(PRODUCT_IMAGE)
  (add via migration)

Category:
  filterConfig Json?
  (add via migration — used by frontend to render segment-specific filters)

SearchProductDocument:
  lastIndexedAt DateTime?
  (add via migration — included in search API response)

NEW GIN INDEX (raw SQL in migration):
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spd_search_vector
  ON "SearchProductDocument" USING GIN (search_vector)
  WHERE "needsReindex" = false;
```

---

## SECTION 7: REDIS CACHE KEY REGISTRY (Complete — v2.0)

```
KEY                                    TTL      OWNER              NOTES
product:{id}                           300s     ProductsService    Product detail cache
product:{slug}                         300s     ProductsService    Slug-based lookup cache
categories:{segment}                   3600s    CategoriesService  Full tree per segment
search:v1:{scope}:{segment}:{hash}     60s      SearchCacheService scope = buyer|admin
seller_business:{userId}               300s     OwnershipService   Business lookup cache
segment_approval_policy:{segment}      300s     ApprovalService    Policy per segment
appconfig:{key}                        300s     AppConfigService   Config values
trending:{segment}                     300s     SearchService      Trending stub
```

---

## SECTION 8: DETAILED SCOPE

### IN SCOPE — Sprint 2

**packages/types (new shared types):**
- `ProductStatus` enum: DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, ARCHIVED
- `MediaType` enum: IMAGE, VIDEO, DOCUMENT, AUDIO, PDF, THREED_MODEL
- `MediaClass` enum: PRODUCT_IMAGE, COMPLIANCE_DOCUMENT, SWATCH, SPEC_SHEET, CAD_FILE
- `ApprovalPolicyType` enum: AUTO_APPROVE, MANUAL_REVIEW, DOCUMENT_REQUIRED, COMPLIANCE_CHECK
- `SearchEngine` interface (DI abstraction)
- `SearchSuggestionResponse` typed struct: `{ queries: string[], categories: CategorySuggestion[], products: ProductSuggestion[] }`
- Zod schemas: `BaseProductSchema`, `TextileProductSchema`, `SparePartsProductSchema`, `ProductSearchSchema`, `ProductListQuerySchema`
- `SegmentProductSchemaRegistry` class
- Response types: `ProductDetailResponse`, `ProductSummaryResponse`, `SearchResultResponse`, `CategoryTreeResponse`

**modules/catalog (NestJS):**
- `CatalogModule` (root)
- `CategoryModule` — read-only category tree with filterConfig, segment-scoped
- `ProductModule` — CRUD, StateMachine, SegmentSchemaRegistry, SegmentApprovalPolicy, ownership
- `MediaModule` — upload pipeline, MediaClassificationService, S3 integration, async processing
- `SearchModule` — SearchEngine DI, PostgresSearchEngine, async GIN reindex, scope-safe cache

**New DB models activated:**
- `SegmentAttributeSchema` — seeded for TEXTILE + SPARE_PARTS
- `SegmentApprovalPolicy` — seeded for TEXTILE + SPARE_PARTS
- `Category.filterConfig` — seeded for all initial categories
- `ProductMedia.displayOrder` — deterministic image ordering
- `Media.mediaClass` — defaults PRODUCT_IMAGE
- `SearchProductDocument` with GIN index on search_vector (async)

**BullMQ workers (new):**
- `ImageProcessingWorker` — WebP variant generation
- `SearchReindexWorker` — async GIN index updates on SearchProductDocument

**APIs delivered:**
- `GET /api/v1/categories` — segment-scoped tree with filterConfig
- `GET /api/v1/categories/:id`
- `POST /api/v1/products` — creates DRAFT status
- `GET /api/v1/products` — segment-scoped list (cursor paginated)
- `GET /api/v1/products/:id` — detail with segmentAttributes, lastIndexedAt
- `PUT /api/v1/products/:id`
- `DELETE /api/v1/products/:id` — soft delete
- `POST /api/v1/products/:id/publish` — triggers StateMachine + approval
- `GET /api/v1/products/seller` — seller's own products (all statuses)
- `GET /api/v1/search/products` — GIN search via SearchEngine DI
- `GET /api/v1/search/suggestions` — typed stub: `{ queries, categories, products }`
- `POST /api/v1/media/upload`
- `DELETE /api/v1/media/:id`

**Frontend (apps/web, apps/seller-dashboard):**
- Buyer search results page (filterConfig-driven filters, no hardcoded filter lists)
- Buyer product detail page (segmentAttributes display)
- Seller product list (status tabs)
- Seller product create/edit form (3-step, dynamic attribute fields from SegmentAttributeSchema)

### OUT OF SCOPE — Sprint 2

| Item | Sprint |
|---|---|
| Inventory stock levels | Sprint 3 |
| Cart and order placement | Sprint 4 |
| Product reviews and ratings | Sprint 5 |
| Supplier offers and pricing rules | Sprint 7 |
| Admin product approval UI | Sprint 7 |
| SegmentAttributeSchema admin CRUD | Sprint 7 |
| OpenSearch integration | Phase 2 |
| AI-assisted product tagging | Phase 3 |
| Bulk CSV product upload | Phase 2 |
| Full search suggestions (from analytics) | Sprint 6 |

---

## SECTION 9: MODULE ARCHITECTURE

### 9.1 Module Structure

```
apps/api/src/modules/
└── catalog/
    ├── catalog.module.ts
    │
    ├── categories/
    │   ├── categories.module.ts
    │   ├── categories.controller.ts
    │   ├── categories.service.ts
    │   ├── categories.repository.ts
    │   └── tests/
    │
    ├── products/
    │   ├── products.module.ts
    │   ├── products.controller.ts
    │   ├── products.service.ts               ← Orchestration
    │   ├── product-approval.service.ts       ← Reads SegmentApprovalPolicy
    │   ├── product-ownership.service.ts      ← Two-hop ownership
    │   ├── product-state-machine.service.ts  ← Transition enforcement (v2.0)
    │   ├── product-events.service.ts         ← EventOutbox emission
    │   ├── products.repository.ts
    │   ├── segment-attribute-schema.repository.ts   ← (v2.0)
    │   ├── segment-approval-policy.repository.ts    ← (v2.0)
    │   └── tests/
    │
    ├── media/
    │   ├── media.module.ts
    │   ├── media.controller.ts
    │   ├── media.service.ts
    │   ├── media.repository.ts
    │   ├── media-classification.service.ts   ← (v2.0) validates mediaClass requirements
    │   ├── storage.interface.ts
    │   ├── s3-storage.service.ts
    │   ├── image-validator.service.ts
    │   └── workers/
    │       └── image-processing.worker.ts
    │
    └── search/
        ├── search.module.ts
        ├── search.controller.ts
        ├── search.service.ts                 ← depends on SEARCH_ENGINE token only
        ├── search-engine.interface.ts        ← (v2.0) DI interface
        ├── postgres-search-engine.ts         ← (v2.0) implements SearchEngine
        ├── search-cache.service.ts           ← scope-aware cache keys (v2.0)
        ├── search-normalizer.service.ts
        └── workers/
            └── search-reindex.worker.ts      ← async GIN updates (v2.0)

packages/types/src/
├── catalog/
│   ├── product.schemas.ts                   ← BaseProductSchema + segment extensions
│   ├── search.schemas.ts
│   ├── search-engine.interface.ts            ← (v2.0) SearchEngine interface
│   └── segment-registry.ts                  ← (v2.0) SegmentProductSchemaRegistry
└── enums/
    └── index.ts                             ← ProductStatus, MediaType, MediaClass, ApprovalPolicyType
```

### 9.2 Module Boundary Rules (Enforced)

```
OWNERSHIP RULES:
  SearchModule reads SearchProductDocument ONLY — never ProductRepository
  ProductsModule uses BusinessQueryService exported from IdentityModule — never BusinessRepository directly
  ImageProcessingWorker updates Media model ONLY — never ProductRepository
  CatalogModule is the sole writer to SearchProductDocument
  SearchModule is the sole reader of SearchProductDocument (for search queries)

CROSS-MODULE:
  CatalogModule exports: ProductsService, CategoriesService
  IdentityModule exports: BusinessQueryService (new — wraps Business lookup)
  ProductsModule imports: BusinessQueryService from IdentityModule

EVENTS (async, no import):
  ProductCreated → EventOutbox → SearchReindexWorker, future NotificationWorker
  ProductUpdated → EventOutbox → SearchReindexWorker, CacheInvalidationWorker
  ProductApproved → EventOutbox → future NotificationWorker

FORBIDDEN IMPORTS:
  SearchModule MUST NOT import ProductRepository
  ProductsModule MUST NOT import BusinessRepository directly
  ImageProcessingWorker MUST NOT import ProductRepository
```

---

## SECTION 10: DATABASE FOUNDATION

### 10.1 Models Activated

All base models exist in schema v4.3 from Sprint 0. Sprint 2 adds:
- `SegmentAttributeSchema` model (new table)
- `SegmentApprovalPolicy` model (new table)
- `Product.segmentAttributes` JSONB (if not exists as metadata)
- `ProductMedia.displayOrder` Int (if not exists)
- `Media.mediaClass` MediaClass enum field
- `Category.filterConfig` JSONB
- `SearchProductDocument.lastIndexedAt` DateTime

### 10.2 Critical Index Verification

```sql
-- Run on staging before sprint close:
SELECT indexname FROM pg_indexes WHERE indexname IN (
  'idx_prod_name_trgm',
  'idx_prod_seg_cat_act',
  'idx_prod_biz_act',
  'idx_prod_slug',
  'idx_cat_seg_active',
  'idx_spd_seg_cat_price_date',
  'idx_spd_search_vector',      -- NEW v2.0: GIN on SearchProductDocument
  'idx_srj_entity_proc'
);
-- All 8 must be present

-- Verify product trigger marks needsReindex only (not full GIN update):
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'product_search_trigger';
-- Must exist, must ONLY update SearchProductDocument.needsReindex = true
```

### 10.3 Mandatory EXPLAIN ANALYZE Verification

```sql
-- 1. GIN on SearchProductDocument (not Product) — must show index scan:
EXPLAIN ANALYZE
SELECT * FROM "SearchProductDocument"
WHERE segment = 'TEXTILE' AND "needsReindex" = false
  AND search_vector @@ to_tsquery('simple', 'kurti')
LIMIT 20;
-- REQUIRED: Bitmap Index Scan on idx_spd_search_vector
-- MUST NOT: Seq Scan

-- 2. Trigram fuzzy fallback:
EXPLAIN ANALYZE
SELECT * FROM "Product"
WHERE segment = 'TEXTILE' AND is_active = true AND is_deleted = false
  AND name ILIKE '%kurti%'
LIMIT 20;
-- REQUIRED: Bitmap Index Scan on idx_prod_name_trgm

-- 3. Category tree:
EXPLAIN ANALYZE
SELECT * FROM "Category"
WHERE segment = 'TEXTILE' AND is_active = true AND is_deleted = false;
-- REQUIRED: Index Scan on idx_cat_seg_active

-- 4. Product list:
EXPLAIN ANALYZE
SELECT * FROM "Product"
WHERE segment = 'TEXTILE' AND is_active = true AND is_deleted = false
ORDER BY created_at DESC, id DESC LIMIT 20;
-- REQUIRED: Index Scan on idx_prod_seg_cat_act

ALL FOUR must confirm index usage. Any Seq Scan BLOCKS sprint close.
```

### 10.4 Transaction Boundaries

```
PRODUCT CREATE (ATOMIC — $transaction):
  1. product = tx.product.create({ segmentAttributes: dto.segmentAttributes })
  2. tx.productMedia.createMany (if mediaIds provided, with displayOrder)
  3. tx.searchProductDocument.upsert({
       update: { needsReindex: true }  ← mark only, no GIN update here
     })
  4. tx.searchReindexJob.upsert({ where: { entityType_entityId } })
  5. tx.eventOutbox.create({
       eventType: 'ProductCreated',
       deduplicationKey: `product-created-${product.id}`  ← deterministic
     })
  6. tx.auditLog.create({ action: 'CREATE', newValue: { ...product, version: product.version } })

PRODUCT PUBLISH (POST /:id/publish — ATOMIC):
  1. ProductStateMachine.validateTransition(current → PENDING_APPROVAL or ACTIVE)
  2. approval logic → determineStatus
  3. tx.product.update({ status })
  4. tx.searchProductDocument.update({ needsReindex: true })
  5. tx.eventOutbox.create({ eventType: 'ProductCreated', ... })  ← fires HERE not at draft create
  6. tx.auditLog.create

NOTE: ProductCreated event fires at PUBLISH, not at draft creation.
      DRAFT products are not commercial events.

PRODUCT UPDATE (ATOMIC — optimistic locking):
  1. ProductStateMachine.validateTransition if status changes
  2. tx.product.update({ where: { id, version: currentVersion }, data: { ...updates, version: { increment: 1 } } })
     → P2025 (not found) or version mismatch → throw ConcurrencyException
  3. tx.searchProductDocument.update({ needsReindex: true })
  4. tx.searchReindexJob.upsert
  5. tx.eventOutbox.create({ deduplicationKey: `product-updated-${product.id}-v${newVersion}` })
  6. tx.cacheInvalidationEvent.create
  7. tx.auditLog.create({ newValue: { ...changes, version: newVersion } })
```

### 10.5 Repository Design

```
ProductRepository:
  ALL queries include: isDeleted = false
  ALL buyer-facing queries include: segment = :segment
  
  findById(id, segment)
  findBySlug(slug, segment)
  findMany(segment, filters, cursorPagination)  ← NO OFFSET
  findBySellerId(businessId, pagination)        ← no segment filter (seller owns all)
  create(data, tx?)
  update(id, data, tx?)                         ← with optimistic locking
  softDelete(id, tx?)
  updateStatus(id, status, approverId?, tx?)
  findByIdAdmin(id)                             ← admin only, no segment filter

SearchProductDocument:
  Written by: ProductsModule ONLY
  Read by: SearchModule ONLY
  Updates: needsReindex = true on product write (trigger)
           search_vector updated by SearchReindexWorker async

SegmentAttributeSchemaRepository:
  findBySegment(segment): SegmentAttributeSchema (cached appconfig:{segment}_attr_schema TTL 300s)
  
SegmentApprovalPolicyRepository:
  findBySegment(segment): SegmentApprovalPolicy (cached segment_approval_policy:{segment} TTL 300s)
```

---

## SECTION 11: IMPLEMENTATION PHASES (v2.0)

### PHASE 1: Shared Types + Schema Migration
**Day 1 morning**
**Context:** schema v4.3, API contracts Section 4, LOCKED_DECISIONS.md

**1.1 — Enums in packages/types:**
```
Add to packages/types/src/enums/index.ts:
  ProductStatus: DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, ARCHIVED
  MediaType: IMAGE, VIDEO, DOCUMENT, AUDIO, PDF, THREED_MODEL
  MediaClass: PRODUCT_IMAGE, COMPLIANCE_DOCUMENT, SWATCH, SPEC_SHEET, CAD_FILE
  ApprovalPolicyType: AUTO_APPROVE, MANUAL_REVIEW, DOCUMENT_REQUIRED, COMPLIANCE_CHECK
```

**1.2 — SearchEngine interface:**
```
Create packages/types/src/catalog/search-engine.interface.ts
  interface SearchEngine {
    search(params: SearchParams): Promise<SearchResult[]>
    suggest(query: string, segment: Segment): Promise<SearchSuggestionResponse>
    index(product: SearchableProduct): Promise<void>
    deindex(productId: string): Promise<void>
    rebuildIndex(segment: Segment): Promise<void>
  }

  interface SearchSuggestionResponse {
    queries: string[]
    categories: { id: string, name: string, slug: string, segment: Segment }[]
    products: { id: string, name: string, slug: string, thumbnailUrl?: string }[]
  }
```

**1.3 — SegmentProductSchemaRegistry:**
```
Create packages/types/src/catalog/segment-registry.ts
  class SegmentProductSchemaRegistry
    private schemas: Map<Segment, ZodSchema>
    register(segment, schema): void
    get(segment): ZodSchema  ← throws NotRegisteredError if missing
    validate(segment, data): { success, data?, errors? }

Create packages/types/src/catalog/product.schemas.ts
  BaseProductSchema (Zod) — all common fields
  TextileProductSchema — extends base
  SparePartsProductSchema — extends base

Initial registrations in registry constructor:
  TEXTILE → TextileProductSchema
  SPARE_PARTS → SparePartsProductSchema
```

**1.4 — Sprint 2 Prisma Migration:**
```
File: packages/database/prisma/migrations/YYYYMMDD_sprint2_segment_extensions/migration.sql

Includes:
  - CREATE TABLE segment_attribute_schemas (...)
  - CREATE TABLE segment_approval_policies (...)
  - ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS segment_attributes JSONB DEFAULT '{}'
  - ALTER TABLE "ProductMedia" ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0
  - ALTER TYPE "MediaType" ADD VALUE IF NOT EXISTS 'PDF' (if not present)
  - ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS media_class "MediaClass" DEFAULT 'PRODUCT_IMAGE'
  - ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS filter_config JSONB
  - ALTER TABLE "SearchProductDocument" ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMPTZ
  - CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spd_search_vector
    ON "SearchProductDocument" USING GIN (search_vector) WHERE "needsReindex" = false;

Run: prisma migrate deploy
Verify: prisma migrate status shows all applied
```

---

### PHASE 2: Category Module
**Day 1 afternoon**
**Context:** schema v4.3 (Category), DB Infra Section 4, Sprint 0 repository pattern

**2.1 — CategoryRepository:**
```
findTree(segment: Segment): Promise<Category[]>
  → Check Redis: categories:{segment}
  → Cache miss: DB query with include children (max 3 levels)
  → Cache set TTL 3600s
  → Return tree

findById(id, segment)
findChildren(parentId, segment)

ALL queries: segment filter enforced + isDeleted = false

CACHE MISS STRATEGY:
  Use raw CTE for recursive tree (not Prisma include recursion — avoids N+1 at depth):
  WITH RECURSIVE category_tree AS (
    SELECT * FROM "Category" WHERE parent_id IS NULL AND segment = $1 AND is_active = true
    UNION ALL
    SELECT c.* FROM "Category" c JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT * FROM category_tree;
```

**2.2 — CategoryService:**
```
getTree(segment): CategoryTreeResponse (includes filterConfig)
getById(id, segment): CategoryTreeResponse | null
```

**2.3 — CategoryController:**
```
GET /api/v1/categories?segment=:segment  → @Public()
GET /api/v1/categories/:id?segment=:segment  → @Public()
```

**2.4 — Category + filterConfig Seed:**
```
TEXTILE categories with filterConfig:
  Sarees: { filters: [
    { field: "segmentAttributes.fabricComposition", label: "Fabric", type: "multiselect",
      options: ["Silk", "Cotton", "Synthetic", "Blend"] },
    { field: "basePrice", label: "Price Range", type: "range" }
  ]}
  Kurtis: { filters: [
    { field: "segmentAttributes.gsm", label: "GSM", type: "range" },
    { field: "basePrice", label: "Price Range", type: "range" }
  ]}

SPARE_PARTS categories with filterConfig:
  2-Wheeler: { filters: [
    { field: "segmentAttributes.vehicleCompatibility", label: "Vehicle", type: "multiselect" },
    { field: "basePrice", label: "Price", type: "range" }
  ]}
```

---

### PHASE 3: Media Module
**Days 2–3**
**Context:** Implementation Architecture Sections 17–18, Runtime Architecture Section 7

**3.1 — StorageService Interface + S3Implementation:**
```
interface StorageService:
  upload(file, key, mimeType): Promise<string>
  getSignedUrl(key, expiresInSeconds): Promise<string>
  delete(key): Promise<void>
  exists(key): Promise<boolean>

S3StorageService implements StorageService
  Key format: media/{userId}/{productId}/{crypto.randomUUID()}.{ext}
  ext from mimeType (not from filename)
  Public product images: CDN_BASE_URL + key (no signing)
  KYC documents: signed URL (5-min TTL, private bucket)
```

**3.2 — ImageValidatorService:**
```
validateMimeType(file): void
  Check Content-Type header (whitelist: image/jpeg, image/png, image/webp)
  Check magic bytes (first 4 bytes):
    JPEG: FF D8 FF
    PNG: 89 50 4E 47
    WebP: 52 49 46 46 ... 57 45 42 50
  If header != magic bytes → throw 400 INVALID_FILE_TYPE (MIME spoofing caught)

validateSize(file): void
  MAX 10MB → throw 400 FILE_TOO_LARGE

computeChecksum(buffer): string → SHA-256

validateDimensions(buffer): Promise<void>
  Minimum: 100x100px (using sharp)
```

**3.3 — MediaClassificationService (v2.0):**
```
validateForSegment(mediaIds: string[], segment: Segment): Promise<void>
  → load SegmentAttributeSchema.requiredMedia for segment
  → for each required media class: check mediaIds have at least min count
  → Sprint 2: both segments require min 1 PRODUCT_IMAGE
  → throws MediaRequirementException if not satisfied
```

**3.4 — MediaRepository:**
```
findById(id)
findByChecksum(checksum, uploadedBy)  ← duplicate detection
create(data): Media
markProcessed(id, thumbnailUrl, mediaClass)
softDelete(id)
findOrphaned(olderThanHours: 24)  ← no ProductMedia link, session expired
```

**3.5 — MediaService.upload():**
```
1. Validate MIME + magic bytes
2. Validate size
3. Compute SHA-256
4. Check duplicate: findByChecksum() → return existing if found
5. Generate S3 key (UUID-based)
6. Upload original to S3
7. Create Media record (isProcessed: false, mediaClass: dto.mediaClass ?? PRODUCT_IMAGE)
8. Enqueue image processing job
9. Return Media with original URL
```

**3.6 — ImageProcessingWorker:**
```
Job data: { mediaId, s3Key, productId, attempt: 0 }
Processing:
  1. Download from S3
  2. Generate variants via sharp:
     thumb (200x200 crop), medium (400x400 fit), large (800x800 fit) — all WebP
  3. Upload variants: {originalKey}-{variant}.webp
  4. Update Media: isProcessed=true, thumbnailUrl=CDN+medium key
  5. CacheInvalidationEvent for product cache

Retry: max 3, exponential 2s/4s/8s
attempt increases per retry — use lower quality settings on attempt 2+
```

---

### PHASE 4: Segment Infrastructure
**Day 3**
**Context:** v2.0 audit spec, SegmentAttributeSchema, SegmentApprovalPolicy

**4.1 — SegmentAttributeSchema Seed:**
```
TEXTILE v1:
  { "required": ["fabricComposition"],
    "optional": ["gsm", "width", "weave"],
    "requiredMedia": [{ "class": "PRODUCT_IMAGE", "min": 1, "max": 10 }] }

SPARE_PARTS v1:
  { "required": ["partNumber"],
    "optional": ["vehicleCompatibility", "oemCode"],
    "requiredMedia": [{ "class": "PRODUCT_IMAGE", "min": 1, "max": 10 }] }
```

**4.2 — SegmentApprovalPolicy Seed:**
```
TEXTILE:     { policyType: AUTO_APPROVE, minTrustScore: 0, requiredDocTypes: [] }
SPARE_PARTS: { policyType: AUTO_APPROVE, minTrustScore: 0, requiredDocTypes: [] }
```

**4.3 — SegmentProductSchemaRegistry:**
```
Instantiated as NestJS provider in ProductsModule.
Constructor registers TextileProductSchema and SparePartsProductSchema.
Injectable into ProductsService.

ADDING NEW SEGMENT (documented procedure):
  1. Create {Segment}ProductSchema.ts in packages/types/src/catalog/schemas/
  2. Register: schemaRegistry.register(Segment.PHARMA, PharmaProductSchema)
  3. Zero other changes
```

**4.4 — ProductStateMachine:**
```
@Injectable() ProductStateMachineService
  validateTransition(from: ProductStatus, to: ProductStatus): void
    VALID_TRANSITIONS map (as in Section 5.10)
    throws InvalidProductTransitionException({ from, to, allowedNext: VALID_TRANSITIONS[from] })
```

---

### PHASE 5: Product Module
**Days 3–5**
**Context:** schema v4.3, Module Breakdown Module 3, Implementation Architecture Section 4, Workflow Diagrams Section 3

**5.1 — ProductRepository:**
```
All queries enforce isDeleted = false.
Buyer-facing queries enforce segment filter.
Cursor pagination only: WHERE (created_at, id) < (:cursorDate, :cursorId)
No OFFSET, ever.

findById(id, segment): includes category, business summary, productMedia→media (displayOrder ASC)
findBySellerId(businessId, pagination): no segment filter, seller owns all
findPendingApproval(segment?): admin only
update(id, data, tx): WHERE { id, version: currentVersion } — optimistic locking, throws P2025 on mismatch
```

**5.2 — ProductOwnershipService:**
```
resolveSellerBusiness(userId): Promise<Business>
  → BusinessQueryService.findByOwnerId(userId) (from IdentityModule)
  → cache: seller_business:{userId} TTL 300s
  → throws PreconditionFailed if not found

verifyProductOwnership(userId, productId): Promise<{ product, business }>
  → resolveSellerBusiness(userId)
  → productRepo.findById(productId)  // no segment filter — seller sees own
  → if product.businessId !== business.id → throw Forbidden

verifyMediaOwnership(userId, mediaId): Promise<Media>
  → mediaRepo.findById(mediaId)
  → if media.uploadedBy !== userId → throw Forbidden
```

**5.3 — ProductApprovalService:**
```
getPolicy(segment): Promise<SegmentApprovalPolicy>
  → segmentApprovalPolicyRepo.findBySegment(segment)
  → cache: segment_approval_policy:{segment} TTL 300s
  → falls back to MANUAL_REVIEW if no policy defined (safe default)

determineInitialStatus(business, userRole, segment): Promise<ProductStatus>
  → policy = await getPolicy(segment)
  → if userRole in [ADMIN, SELLER_MANAGER]: return ACTIVE
  → if policy.policyType === AUTO_APPROVE && business.trustScore >= policy.minTrustScore: return ACTIVE
  → if policy.policyType === DOCUMENT_REQUIRED: [check docs — Sprint 2 stub → PENDING_APPROVAL]
  → default: return PENDING_APPROVAL
```

**5.4 — ProductEventsService:**
```
All EventOutbox, SearchReindexJob, AuditLog writes for product domain.
All methods take TransactionClient — must be called WITHIN $transaction.

emitProductCreated(tx, product, userId)
  → tx.eventOutbox.create({ deduplicationKey: `product-created-${product.id}` })
  → tx.searchReindexJob.upsert({ where: { entityType_entityId } })
  → tx.auditLog.create({ action: 'CREATE', newValue: { ...product, version: product.version } })

emitProductUpdated(tx, product, userId, changes)
  → tx.eventOutbox.create({ deduplicationKey: `product-updated-${product.id}-v${product.version}` })
  → tx.searchReindexJob.upsert
  → tx.cacheInvalidationEvent.create
  → tx.auditLog.create({ newValue: { ...changes, version: product.version } })

emitProductDeleted, emitProductApproved — same pattern
```

**5.5 — ProductsService (Orchestration):**
```
createProduct(dto, userId, userRole):
  1. resolveSellerBusiness(userId)
  2. schema = schemaRegistry.get(dto.segment)
     result = schema.safeParse(dto)
     if (!result.success) throw ValidationException
  3. validateCategorySegmentMatch(dto.categoryId, dto.segment)
  4. validateMediaOwnership(userId, dto.mediaIds)
  5. mediaClassificationService.validateForSegment(dto.mediaIds, dto.segment)
  6. determinInitialStatus (returns DRAFT — publish is separate action)
  7. Generate slug (slugify + uniqueness check + P2002 retry with suffix)
  8. $transaction → create product + ProductMedia + SearchProductDocument.needsReindex=true
     + SearchReindexJob + AuditLog
     NOTE: NO EventOutbox here — ProductCreated fires at PUBLISH not at draft create

publishProduct(productId, userId, userRole):
  1. verifyProductOwnership(userId, productId)
  2. productStateMachine.validateTransition(product.status, PENDING_APPROVAL)
  3. status = productApprovalService.determineInitialStatus(business, userRole, product.segment)
  4. $transaction → updateStatus + EventOutbox ProductCreated + SearchReindexJob + AuditLog

updateProduct(productId, dto, userId):
  1. verifyProductOwnership(userId, productId)
  2. schema validation (segmentAttributes if changed)
  3. $transaction → update + needsReindex=true + EventOutbox ProductUpdated + cache invalidation

deleteProduct(productId, userId):
  1. verifyProductOwnership
  2. productStateMachine.validateTransition(product.status, ARCHIVED)
  3. $transaction → softDelete + needsReindex=true + EventOutbox ProductDeleted

getProduct(id, segment):
  → Redis cache hit: product:{id}
  → Cache miss: DB query → map to ProductDetailResponse (include lastIndexedAt from SPD)
  → Cache result TTL 300s

SLUG UNIQUENESS:
  On P2002 (unique constraint): catch → generate new slug with randomHex(4) suffix → retry (max 3)
```

**5.6 — ProductsController:**
```
POST   /api/v1/products              @Roles(SELLER)  → createProduct (DRAFT)
POST   /api/v1/products/:id/publish  @Roles(SELLER)  → publishProduct (fires ProductCreated)
GET    /api/v1/products              @Public()       → listProducts (segment required)
GET    /api/v1/products/seller       @Roles(SELLER)  → listSellerProducts
GET    /api/v1/products/:id          @Public()       → getProduct (segment from query)
PUT    /api/v1/products/:id          @Roles(SELLER)  → updateProduct
DELETE /api/v1/products/:id          @Roles(SELLER)  → deleteProduct

ProductDetailResponse includes: segmentAttributes, lastIndexedAt (from SearchProductDocument)
```

---

### PHASE 6: Search Module
**Days 5–6**
**Context:** DB Infra Architecture Section 4, Indexing Strategy Sections 7–8, Implementation Architecture Section 14

**6.1 — SearchNormalizerService:**
```
loadSynonyms() at startup from AppConfig (keys: search_synonym_{term})
  Cache in Map<string, string[]> (reload every 15 min or on config update)

normalize(rawQuery):
  1. toLowerCase().trim()
  2. Remove special chars
  3. Split into terms
  4. Synonym expansion per term
  5. Build tsquery: multi-word → AND (&), synonyms → OR (|)
  6. Prefix last term with :* for suggestions

INITIAL SYNONYMS (AppConfig seed):
  search_synonym_kurti → ["kurtee", "kurta set", "kurta-set"]
  search_synonym_saree → ["sari", "sarees"]
  search_synonym_brake → ["break", "breakes"]
  search_synonym_splendor → ["splender", "splendour"]
```

**6.2 — SearchCacheService (v2.0 — scope-safe):**
```
buildKey(scope: 'buyer'|'admin', segment, normalizedQuery, filters):
  → `search:v1:${scope}:${segment}:${sha256(normalizedQuery + JSON.stringify(sortedFilters))}`

getSearchResults(key): SearchResult[] | null
setSearchResults(key, results, TTL=60s)

REASON scope in key: Admin cross-segment results must NEVER be served from buyer cache.
```

**6.3 — PostgresSearchEngine (implements SearchEngine):**
```
search(params):
  WITH q AS (SELECT to_tsquery('simple', ${params.tsQuery}) AS tsq)
  SELECT
    spd.id, spd.name, spd.slug, spd.price AS "basePrice", spd.segment,
    ts_rank(spd.search_vector, q.tsq, 1) AS rank,
    spd.last_indexed_at AS "lastIndexedAt",
    m.url AS "thumbnailUrl"
  FROM "SearchProductDocument" spd
  CROSS JOIN q
  LEFT JOIN "ProductMedia" pm ON pm.product_id = spd.product_id
  LEFT JOIN "Media" m ON m.id = pm.media_id AND m.is_processed = true
  WHERE spd.segment = ${params.segment}::"Segment"
    AND spd."needsReindex" = false
    AND spd.search_vector @@ q.tsq
    [AND spd.category_id = ${params.categoryId}]
    [AND spd.price >= ${params.minPrice}]
    [AND spd.price <= ${params.maxPrice}]
    [AND (spd.created_at, spd.product_id) < (${cursor.createdAt}, ${cursor.id})]
  GROUP BY spd.id, q.tsq, m.url
  ORDER BY rank DESC, spd.created_at DESC, spd.product_id DESC
  LIMIT ${params.limit}

CRITICAL: Uses Prisma.sql template tag ONLY. Zero string interpolation.

fuzzyFallback(rawQuery, segment, limit):
  ILIKE with pg_trgm similarity — for zero-result GIN queries

suggest(query, segment): SearchSuggestionResponse
  Sprint 2 stub:
    { queries: [], categories: matchingCategoriesFromCache, products: [] }
  Sprint 6: full implementation from SearchAnalytics

deindex(productId): update SPD needsReindex=true (search worker will skip ARCHIVED/deleted)
rebuildIndex(segment): enqueue full segment reindex job
```

**6.4 — SearchReindexWorker (v2.0 — async GIN updates):**
```
Processes jobs from 'search-reindex' queue.
Job discrimination: { type: 'PRODUCT_REINDEX' | 'IMAGE_PROCESSING' }

PRODUCT_REINDEX:
  1. Load product (name, description, segmentAttributes, status)
  2. If deleted or not ACTIVE: update SPD (needsReindex=false), skip GIN
  3. Compute tsvector:
     to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' ||
     coalesce(flatten_jsonb_values(segmentAttributes), ''))
  4. UPDATE "SearchProductDocument" SET
       search_vector = computed_tsvector,
       needsReindex = false,
       last_indexed_at = now()
     WHERE product_id = :productId
  5. GIN index auto-updates on this UPDATE (on SearchProductDocument, not Product)
  6. Mark SearchReindexJob.processedAt = now()

SEGMENT-AWARE BOOSTING (applied in SearchService, not SQL):
  Load SegmentSearchConfig from AppConfig: search_config_{segment}
  {
    "rankingBoosts": {
      "isVerifiedSeller": 1.3,
      "hasImages": 1.2,
      "moqLessThan6": 1.1
    }
  }
  Apply multipliers to ts_rank scores post-query in SearchService.

STALENESS CHECK:
  After indexing, if SPD.needsReindex is STILL true (another write happened during processing):
  immediately re-enqueue rather than accepting stale index.

CLEANUP CRON (weekly, Sprint 9 maintenance jobs):
  DELETE FROM "SearchReindexJob" WHERE processedAt IS NOT NULL AND processedAt < NOW() - INTERVAL '30 days'
```

**6.5 — SearchService:**
```
Constructor: inject SEARCH_ENGINE token (not PostgresSearchEngine directly)

searchProducts(dto, userId?, scope='buyer'):
  1. normalized = normalizer.normalize(dto.q)
  2. cacheKey = cacheService.buildKey(scope, dto.segment, normalized, filters)
  3. cached = await cacheService.getSearchResults(cacheKey)
  4. If cached: return { results: cached, fromCache: true }
  5. tsQuery = normalizer.buildTsQuery(normalized)
  6. results = await searchEngine.search({ tsQuery, ...dto })
  7. If results.length === 0: fallback = await searchEngine.fuzzyFallback(dto.q, dto.segment, dto.limit)
                              results = fallback; fallbackUsed = true
  8. nextCursor = encodeLastItem(results[results.length-1])
  9. cacheService.setSearchResults(cacheKey, results)
  10. logSearchAnalytics async (fire-and-forget, 10% sampling via AppConfig SEARCH_ANALYTICS_SAMPLE_RATE)
  11. Return { results, nextCursor, fallbackUsed, fromCache: false }

getSuggestions(query, segment):
  → searchEngine.suggest(query, segment) → SearchSuggestionResponse
```

**6.6 — SearchController:**
```
GET /api/v1/search/products    @Public()  → ProductSearchSchema validation
GET /api/v1/search/suggestions @Public()  → returns SearchSuggestionResponse (typed)
```

---

### PHASE 7: Module Wiring
**Day 7**

**7.1 — IdentityModule Update:**
```
Export BusinessQueryService from IdentityModule:
  BusinessQueryService.findByOwnerId(userId): Promise<Business | null>
  BusinessQueryService.invalidateCache(userId): Promise<void>

ProductsModule imports BusinessQueryService from IdentityModule.
ProductsModule NEVER imports BusinessRepository directly.
```

**7.2 — CatalogModule Assembly:**
```
CatalogModule:
  imports: [CategoriesModule, ProductsModule, MediaModule, SearchModule]
  exports: [ProductsService, CategoriesService]

ProductsModule:
  imports: [CategoriesModule, MediaModule, IdentityModule]
  providers: [
    ProductsService, ProductOwnershipService, ProductApprovalService,
    ProductStateMachineService, ProductEventsService, ProductsRepository,
    SegmentAttributeSchemaRepository, SegmentApprovalPolicyRepository,
    SegmentProductSchemaRegistry, MediaClassificationService
  ]

SearchModule:
  providers: [
    SearchService, SearchNormalizerService, SearchCacheService,
    { provide: SEARCH_ENGINE, useClass: PostgresSearchEngine },
    PostgresSearchEngine
  ]

AppModule: add CatalogModule to imports
```

---

### PHASE 8: Seed Data
**Day 7 (parallel)**

```
packages/database/prisma/seed.ts additions:

1. Category trees (TEXTILE + SPARE_PARTS) with filterConfig — upsert, idempotent
2. SegmentAttributeSchema (TEXTILE v1, SPARE_PARTS v1) — upsert
3. SegmentApprovalPolicy (TEXTILE, SPARE_PARTS) — upsert
4. AppConfig search synonyms:
   search_synonym_kurti, search_synonym_saree, search_synonym_brake, etc.
5. AppConfig SegmentSearchConfig:
   search_config_TEXTILE: { rankingBoosts: { isVerifiedSeller: 1.3, hasImages: 1.2 } }
   search_config_SPARE_PARTS: { rankingBoosts: { isVerifiedSeller: 1.4, hasImages: 1.1 } }

CATEGORY TREES:
TEXTILE segment:
  Sarees → {Silk, Cotton, Synthetic, Blend}
  Kurtis → {Straight, Anarkali, A-Line, Palazzo Set}
  Fabrics → {Cotton, Silk, Synthetic, Georgette}
  Dress Materials → {Cotton, Synthetic}
  Men's Wear → {Shirts, Kurtas, Trousers}
  Women's Ethnic → {Lehengas, Blouses, Dupattas}
  Kids Wear → {Boys, Girls}

SPARE_PARTS segment:
  2-Wheeler → {Brakes, Engine Parts, Electrical, Body Parts, Filters}
  4-Wheeler → {Brakes, Engine Parts, Electrical, Body Parts, Filters}
  Truck & HCV → {Brakes, Engine Parts, Clutch, Tyres}
  Accessories → {Tools, Cleaning, Maintenance}
  Lubricants → {Engine Oil, Gear Oil, Grease}

All slugs: lowercase, hyphenated, URL-safe.
Seed run: pnpm --filter @vyaparnet/database run seed
Must be idempotent: upsert not create.
```

---

### PHASE 9: Frontend
**Days 7–9**
**Context:** Product UX System Sections 7–10, IA Sections 8–9

**9.1 — API Clients:**
```
apps/web/lib/api/search.client.ts       → typed, Zod-validated
apps/web/lib/api/products.client.ts     → typed
apps/web/lib/api/categories.client.ts   → typed

All: return { data, error } discriminated union. Never throw.
Include Authorization header if token present.
```

**9.2 — Buyer Search Results Page:**
```
File: apps/web/app/(main)/search/page.tsx

Layout:
  Sticky top: search bar
  Left/Top: filter panel — READS from category.filterConfig (not hardcoded)
  Main: product grid (2-col mobile, 3-col desktop)
  Footer: infinite scroll via IntersectionObserver

Features:
  URL sync: ?q=saree&segment=TEXTILE&sort=relevance
  300ms debounce on input
  Skeleton loaders (no CLS)
  fallbackUsed=true → show "Related results showing"
  Segment-specific filters rendered dynamically from filterConfig.filters
  lastIndexedAt displayed on each card: "Updated X mins ago" (from API)
```

**9.3 — Buyer Product Detail Page:**
```
File: apps/web/app/(main)/products/[slug]/page.tsx
SSR, revalidate: 60s

Layout:
  Image gallery: swipeable, displayOrder respected (not random)
  Product name, category breadcrumb
  Price (₹ Indian locale), MRP strikethrough
  MOQ badge
  segmentAttributes: displayed dynamically from product.segmentAttributes JSONB
    (label from SegmentAttributeSchema.schema.properties[field].label — fetched from API)
  Verified seller badge
  Action buttons: "Add to Order" (stub), "Request Quote" (stub)
  lastIndexedAt: subtle "Price last updated X mins ago"
```

**9.4 — Seller Product List:**
```
File: apps/seller-dashboard/app/(main)/products/page.tsx

Status tabs: All | Active | Pending | Rejected | Draft | Archived
Status badge colors: design token mapped
Edit/Archive/Publish actions per row
Empty state per tab with CTA
```

**9.5 — Seller Product Create/Edit Form (3-step):**
```
File: apps/seller-dashboard/app/(main)/products/new/page.tsx

Step 1: Basic Info (name, category, description, tags)
Step 2: Pricing (basePrice, mrp, moq, unit, hsnCode, gstPercent)
Step 3: Images (drag-drop, POST /media/upload per file immediately on selection,
        show progress, thumbnail preview)
        Image type selected (PRODUCT_IMAGE / SWATCH default PRODUCT_IMAGE)

SEGMENT ATTRIBUTES:
  After step 1 (category selected), fetch SegmentAttributeSchema for segment.
  Render attribute fields dynamically from schema.required + schema.optional.
  Required fields show red asterisk.
  This renders TEXTILE's fabricComposition/gsm fields without hardcoding.

localStorage draft autosave after each step.
"Draft mila. Wapas karna chahte hain?" restore prompt on revisit.

Submit → POST /products (creates DRAFT)
Publish → POST /products/:id/publish
```

---

### PHASE 10: Testing
**Day 9**

**10.1 — Mandatory Tests:**

```
SEGMENT ISOLATION (MANDATORY — sprint blocked if fails):
  test: 'TEXTILE query never returns SPARE_PARTS products'
    Create TEXTILE + SPARE_PARTS products with same name.
    searchProducts({ q: name, segment: TEXTILE })
    Assert all results.segment === TEXTILE

  test: 'GET /products/:id wrong segment → 404'
    Create TEXTILE product. GET /products/:id?segment=SPARE_PARTS → 404

GIN INDEX ON SearchProductDocument (MANDATORY):
  test: 'EXPLAIN ANALYZE confirms Bitmap Index Scan on idx_spd_search_vector'
    Query SearchProductDocument not Product.

HINGLISH FUZZY (MANDATORY):
  test: 'kurtee finds Cotton Kurti Set via synonym expansion'
    product: "Cotton Kurti Set". searchProducts({ q: 'kurtee', segment: TEXTILE })
    Assert product in results.

PRODUCT STATE MACHINE (MANDATORY):
  test: 'Invalid transition throws InvalidProductTransitionException'
    ACTIVE → DRAFT → throws
  test: 'Valid transitions succeed'
    DRAFT → PENDING_APPROVAL, PENDING_APPROVAL → ACTIVE, etc.

EVENTOUTBOX IDEMPOTENCY (MANDATORY):
  test: 'Retry of same publishProduct does not create duplicate EventOutbox entry'
    publishProduct twice (simulate retry). Assert EventOutbox count === 1 for product-created-{id}

OWNERSHIP SECURITY (MANDATORY):
  test: 'Seller A cannot PUT Seller B product → 403'
  test: 'Seller A cannot publish Seller B product → 403'

SEGMENT ATTRIBUTE VALIDATION (MANDATORY):
  test: 'Create TEXTILE product without required fabricComposition → 400'
  test: 'Create TEXTILE product with valid segmentAttributes → 201'
  test: 'SegmentAttributeSchema seeded for TEXTILE + SPARE_PARTS'

SEGMENT APPROVAL POLICY (MANDATORY):
  test: 'SegmentApprovalPolicy.AUTO_APPROVE → product status ACTIVE for trusted seller'
  test: 'New segment with MANUAL_REVIEW policy → PENDING_APPROVAL (no code changes required)'

SEARCH CACHE SCOPE (MANDATORY):
  test: 'Admin search cache key different from buyer cache key (same query)'
    Verify keys: search:v1:admin:TEXTILE:... !== search:v1:buyer:TEXTILE:...

MODULE BOUNDARIES (MANDATORY):
  test: 'SearchModule dependency graph contains no ProductRepository import'
    Verify via NestJS dependency resolution / static analysis
  test: 'ProductsModule imports BusinessQueryService not BusinessRepository'

MEDIA CLASSIFICATION (MANDATORY):
  test: 'Create product with no PRODUCT_IMAGE media → MediaRequirementException'
  test: 'Create product with 1 PRODUCT_IMAGE → success'
```

**10.2 — Unit Test Coverage:**

```
SearchNormalizerService: synonym expansion, multi-word AND, prefix :*
ProductApprovalService: AUTO_APPROVE path, MANUAL_REVIEW path, ADMIN override
ProductOwnershipService: correct owner, wrong owner (403), not found (404)
ProductStateMachine: all valid transitions, all invalid transitions
SegmentProductSchemaRegistry: registered segment validates, unregistered throws
MediaClassificationService: min image satisfied, min image not satisfied
ImageValidatorService: valid JPEG, valid PNG, PDF masquerading as JPEG (reject), oversize (reject)
Slug generation: collision → retry with suffix, max length enforced

Coverage target: ≥ 80% for all Sprint 2 modules.
```

---

### PHASE 11: Observability
**Day 9 (parallel)**

```
CatalogMetrics injectable service:

Counters:
  product_created_total{segment, status}
  product_published_total{segment, status}
  product_updated_total{segment}
  product_deleted_total{segment}
  search_query_total{segment, engine}      ← engine: postgres | opensearch
  search_fallback_total{segment}
  search_zero_results_total{segment}
  search_cache_hit_total{segment, scope}
  media_upload_total{status, mediaClass}
  media_processing_total{status}
  segment_attr_validation_failure_total{segment}
  approval_policy_type_total{segment, policyType}

Histograms:
  search_query_duration_ms{segment}
  product_create_duration_ms
  media_upload_duration_ms

ALERTS:
  search_gin_index_size_bytes > 500MB → OpenSearch migration trigger
  search p95 > 150ms → Grafana alert
  search_zero_results_rate > 20% → synonym gap alert
  media_processing failure rate > 5% → worker alert
```

---

### PHASE 12: Staging Deployment + Verification
**Day 10**

```
1. Run migration: prisma migrate deploy
2. Run seed: pnpm --filter @vyaparnet/database run seed
3. Run index verification SQL (Section 10.2)
4. Deploy containers: apps/api, apps/web, apps/seller-dashboard
5. Manual verification:
   a. GET /categories?segment=TEXTILE → tree + filterConfig present
   b. GET /categories?segment=SPARE_PARTS → correct tree
   c. POST /products (DRAFT) → product created, no EventOutbox entry
   d. POST /products/:id/publish → EventOutbox entry created, status transitions
   e. GET /search/products?q=kurti&segment=TEXTILE → results
   f. GET /search/products?q=kurtee&segment=TEXTILE → same results (synonym)
   g. GET /search/products?q=saree&segment=SPARE_PARTS → empty (isolation)
   h. EXPLAIN ANALYZE → confirm idx_spd_search_vector on SearchProductDocument
   i. POST /media/upload (PDF with image/jpeg) → 400 INVALID_FILE_TYPE
   j. POST /products with no PRODUCT_IMAGE → MediaRequirementException
   k. GET /search/suggestions → { queries: [], categories: [...], products: [] } (typed)
6. CURRENT_PHASE.md update
```

---

## SECTION 12: SPRINT VALIDATION GATE (v2.0 — Comprehensive)

All items must pass before Sprint 3 begins. Zero failures allowed.

```
SEGMENT ARCHITECTURE (NEW v2.0)
✅ SegmentAttributeSchema table seeded for TEXTILE + SPARE_PARTS
✅ Product create with invalid segmentAttributes → 400 VALIDATION_ERROR with field errors
✅ Product create with valid segmentAttributes → stored in product.segmentAttributes JSONB
✅ SegmentApprovalPolicy seeded for TEXTILE (AUTO_APPROVE) + SPARE_PARTS (AUTO_APPROVE)
✅ Mock MANUAL_REVIEW segment test: approval service returns PENDING_APPROVAL with ZERO code changes
✅ SegmentProductSchemaRegistry registered for TEXTILE + SPARE_PARTS
✅ Adding MOCK_SEGMENT to registry requires ZERO changes to existing code paths

PRODUCT LIFECYCLE (NEW v2.0)
✅ POST /products → DRAFT status (no EventOutbox entry at this point)
✅ POST /products/:id/publish → status transitions (PENDING_APPROVAL or ACTIVE)
✅ POST /products/:id/publish → EventOutbox entry created NOW (not at draft creation)
✅ Invalid transition attempt (e.g., DRAFT → ARCHIVED) → 422 INVALID_TRANSITION
✅ ProductStateMachine tested for all 10 valid + all invalid transition paths

SEARCH ARCHITECTURE (NEW v2.0)
✅ GIN index is on SearchProductDocument.search_vector (NOT Product.search_vector)
✅ EXPLAIN ANALYZE confirms Bitmap Index Scan on idx_spd_search_vector
✅ Product write does NOT block GIN update (confirmed via concurrent write test)
✅ SearchReindexWorker processes needsReindex=true records correctly
✅ search_vector includes segmentAttributes values (not just name + description)
✅ SEARCH_ENGINE DI token resolves to PostgresSearchEngine (verify via DI token test)
✅ SearchSuggestionResponse is typed struct: { queries, categories, products }

EVENTOUTBOX CONSISTENCY (NEW v2.0)
✅ ProductCreated deduplicationKey = product-created-${productId} (deterministic, no timestamp)
✅ Retry of same publishProduct → duplicate EventOutbox entry NOT created (dedup works)
✅ ProductUpdated deduplicationKey = product-updated-${productId}-v${version}
✅ SearchReindexJob.upsert on product update (not create — no duplicate jobs)

MEDIA GOVERNANCE (NEW v2.0)
✅ Media.mediaClass = PRODUCT_IMAGE for standard uploads
✅ Product creation rejected without min 1 PRODUCT_IMAGE → MediaRequirementException
✅ Category.filterConfig populated for all seeded categories
✅ Frontend renders filters from filterConfig (not hardcoded list)
✅ ProductMedia.displayOrder present on all records
✅ Product detail image gallery respects displayOrder (first image = primary)

MODULE BOUNDARIES (NEW v2.0)
✅ SearchModule dependency graph: no ProductRepository import (static analysis or runtime check)
✅ ProductsModule imports BusinessQueryService not BusinessRepository
✅ ImageProcessingWorker: no ProductRepository import

CACHE SAFETY (NEW v2.0)
✅ Search cache keys: search:v1:buyer:TEXTILE:... AND search:v1:admin:TEXTILE:... are DIFFERENT
✅ Admin search result not served from buyer-scope cache

CATEGORY API
✅ GET /categories?segment=TEXTILE → tree with filterConfig
✅ GET /categories?segment=SPARE_PARTS → separate tree
✅ GET /categories (no segment) → 400
✅ Category tree cached in Redis: categories:TEXTILE exists after first request
✅ Cross-segment isolation: TEXTILE tree has no SPARE_PARTS categories

PRODUCT CRUD
✅ POST /products (valid, SELLER role) → 201 DRAFT
✅ POST /products (no auth) → 401
✅ POST /products (BUYER role) → 403
✅ POST /products (wrong segment category) → 400
✅ GET /products?segment=TEXTILE → cursor-paginated list
✅ GET /products/:id?segment=TEXTILE → full detail including segmentAttributes + lastIndexedAt
✅ GET /products/:id?segment=SPARE_PARTS (TEXTILE product) → 404
✅ PUT /products/:id (own) → 200 updated
✅ PUT /products/:id (other seller) → 403
✅ DELETE /products/:id (own) → soft deleted, not in search

SEARCH
✅ GET /search/products?q=kurti&segment=TEXTILE → results with rank
✅ GET /search/products?q=kurtee&segment=TEXTILE → same results (synonym)
✅ GET /search/products?q=kurti&segment=SPARE_PARTS → empty (isolation)
✅ GET /search/products (no segment) → 400
✅ EXPLAIN ANALYZE confirms GIN index on SearchProductDocument
✅ Search cache: second identical request faster
✅ Cursor pagination: next cursor → next page → no duplicates
✅ GET /search/suggestions → { queries: [], categories: [...], products: [] } (typed struct)

MEDIA
✅ POST /media/upload (valid JPEG) → 201 with S3 URL
✅ POST /media/upload (PDF with image/jpeg Content-Type) → 400 INVALID_FILE_TYPE
✅ POST /media/upload (11MB file) → 400 FILE_TOO_LARGE
✅ Media.checksum = SHA-256 of file
✅ Duplicate checksum → returns existing Media record
✅ Image processing job queued after upload

OWNERSHIP + SECURITY
✅ Seller A cannot PUT Seller B product → 403
✅ Seller A cannot publish Seller B product → 403
✅ Seller without onboarded business → PreconditionFailed
✅ S3 key is UUID-based (no original filename in key)
✅ MIME spoofing rejected
✅ All $queryRaw uses Prisma.sql (SQL injection verified)

PERFORMANCE
✅ GET /search/products p95 < 150ms on staging
✅ GET /products/:id p95 < 100ms (with cache < 10ms)
✅ All 4 EXPLAIN ANALYZE queries confirm index usage (zero Seq Scans)

FRONTEND
✅ Search results page filters rendered from filterConfig (not hardcoded)
✅ Product detail shows segmentAttributes dynamically
✅ Seller can create product via 3-step form with segment-specific attribute fields
✅ Seller form step 3: images upload immediately with progress

QUALITY
✅ pnpm typecheck → zero errors
✅ pnpm test → all tests passing
✅ pnpm lint → zero errors
✅ Coverage ≥ 80% for catalog module
✅ Search synonym seed verified on staging
✅ SegmentAttributeSchema + SegmentApprovalPolicy seeded and verified on staging
```

---

## SECTION 13: FAILURE CONDITIONS

Sprint 2 is FAILED if ANY of the following occur:

| Failure | Severity |
|---|---|
| Search returns SPARE_PARTS product for TEXTILE segment query | BLOCKING — CRITICAL |
| Seller A can modify Seller B's product | BLOCKING — CRITICAL |
| GIN index NOT on SearchProductDocument (Seq Scan on Product) | BLOCKING — CRITICAL |
| ProductCreated EventOutbox fires at draft creation (not publish) | BLOCKING |
| Duplicate EventOutbox entry on retry of publishProduct | BLOCKING |
| Invalid status transition succeeds without StateMachine validation | BLOCKING |
| SQL injection possible in search queries (string interpolation used) | BLOCKING — CRITICAL |
| MIME spoofing accepted (PDF as image/jpeg passes) | BLOCKING — CRITICAL |
| S3 key uses original filename | BLOCKING |
| SearchModule imports ProductRepository directly | BLOCKING |
| Product created with no PRODUCT_IMAGE accepted | BLOCKING |
| SegmentAttributeSchema not seeded | BLOCKING |
| SegmentApprovalPolicy not seeded | BLOCKING |
| Adding mock segment requires code changes | BLOCKING |
| FilterConfig missing from category API response | HIGH |
| Product detail image gallery not respecting displayOrder | HIGH |
| lastIndexedAt missing from product detail response | HIGH |
| SearchSuggestionResponse is flat string[] (not typed struct) | HIGH |
| Admin search cache key = buyer cache key | HIGH |
| TypeScript errors in any catalog module | BLOCKING |
| Any failing test | BLOCKING |

---

## SECTION 14: ROLLBACK STRATEGY

| Checkpoint | Rollback Method |
|---|---|
| After Phase 1 (types + migration) | git revert types, prisma migrate down |
| After Phase 2 (categories) | Remove CategoryModule from CatalogModule |
| After Phase 3 (media) | Disable MediaController routes |
| After Phase 4 (segment infra) | Remove segment registry from ProductsModule |
| After Phase 5 (products) | Redeploy Sprint 1 API image |
| After Phase 6 (search) | Remove SearchModule from CatalogModule |
| Frontend | Redeploy previous frontend container |

**Database rollback:** All Sprint 2 schema additions are additive (new columns, new tables). Rolling back application code while leaving schema in place is safe — new columns/tables are unused by v1.0 code.

**Emergency search degradation:**
```sql
-- Disable GIN reindex (search_vector stops updating):
-- Search falls back to ILIKE automatically (still functional, slower)
-- Re-enable: fix issue, re-run SearchReindexWorker for full backfill
```

---

## SECTION 15: AI EXECUTION SAFETY RULES

### MUST NEVER DO

| Rule | Reason |
|---|---|
| Omit segment filter from ANY buyer-facing repository query | Data isolation breach |
| Use string interpolation in $queryRaw | SQL injection |
| Use original filename as S3 key | Path traversal |
| Check only Content-Type for MIME validation (skip magic bytes) | MIME spoofing |
| Write EventOutbox at draft creation (not at publish) | Incorrect event semantics |
| Skip ProductStateMachine.validateTransition before status change | Silent data corruption |
| Allow duplicate EventOutbox entries on retry | Event consistency violation |
| Write SearchEngine-specific code in SearchService (use DI token) | OpenSearch migration blocker |
| Put segment-specific columns on Product table | God schema anti-pattern |
| Write if (segment === 'x') conditional chains | Forbidden pattern |
| Skip AuditLog.version in newValue | Compliance gap |
| Use english tsvector dictionary | Breaks Hinglish search |
| OFFSET pagination anywhere | Forbidden per indexing strategy |
| Cross-module direct DB access | Module boundary violation |
| Create new PrismaClient() | Use PrismaService |
| Import @prisma/client directly | Use @vyaparnet/database |
| Return raw Prisma entities from controllers | Always map to DTO |

### MANDATORY HUMAN REVIEW POINTS

| Point | Review Type |
|---|---|
| All repository methods — segment filter present | Architecture audit |
| All $queryRaw — Prisma.sql template tag used | Security audit |
| S3 key generation — UUID-based, no filename | Security audit |
| MIME validation — magic bytes implemented | Security audit |
| ProductEventsService calls — all within $transaction | Architecture audit |
| publishProduct — EventOutbox fires HERE not at createProduct | Event correctness |
| ProductStateMachine called before every status update | State safety |
| SegmentProductSchemaRegistry — throws on unregistered segment | Fail-fast verification |
| SearchEngine DI token — not PostgresSearchEngine injected directly | Migration readiness |
| Category filterConfig — seeded and present in API response | UX correctness |
| Frontend filters — rendered from filterConfig (not hardcoded) | Extensibility audit |

---

## SECTION 16: FUTURE EXTENSIBILITY NOTES

### Adding a New Segment (e.g., PHARMA)

```
APPLICATION CODE CHANGES (minimal):
  1. Add PHARMA to Segment enum in schema.prisma + packages/types → generate migration
  2. Create PharmaProductSchema.ts in packages/types/src/catalog/schemas/
  3. Register in SegmentProductSchemaRegistry constructor
  
DATABASE CHANGES (no code):
  4. Insert SegmentAttributeSchema for PHARMA (via admin UI in Sprint 7, or seed script)
  5. Insert SegmentApprovalPolicy for PHARMA (DOCUMENT_REQUIRED, requiredDocTypes: ['DRUG_LICENSE'])
  6. Insert Category seed for PHARMA
  7. Insert AppConfig: search_config_PHARMA, synonyms for PHARMA terms

RESULT:
  - PHARMA products validate against PharmaProductSchema
  - PHARMA products require DRUG_LICENSE media before approval
  - PHARMA products are isolated from all other segments
  - PHARMA search naturally includes pharma attribute values in search_vector
  - PHARMA approval requires document verification (no code change)
  - PHARMA categories have their own filterConfig
```

### OpenSearch Migration Path

```
SearchProductDocument IS the sync layer. When ready:
  1. Stand up OpenSearch cluster
  2. OpenSearchEngine implements SearchEngine interface (already defined)
  3. Bulk import from SearchProductDocument (needsReindex=false rows already indexed)
  4. AppConfig: SEARCH_ENGINE_PROVIDER = 'opensearch'
  5. SearchModule DI provider switches to OpenSearchEngine
  6. PostgresSearchEngine remains as fallback
  7. Zero SearchService code changes
  8. Zero Product model changes
```

### ERP Integration

```
Product.hsnCode + Product.gstPercent (Sprint 2) are the GST invoice integration points.
Product.businessId → Business.gstNumber chain enables B2B invoice generation.
No Sprint 7 invoicing changes required to these fields.
```

### AI Catalog Assistant

```
Product.tags String[] captures AI-classification signals.
SearchProductDocument.search_vector supports semantic expansion.
segmentAttributes JSONB is structured input for AI attribute extraction.
The Sprint 2 SearchEngine interface supports future AI-powered ranking implementations.
```

---

## SECTION 17: MEDIUM RISK MITIGATIONS (Required in Implementation)

### Cache Stampede on Category Tree
**Fix:** When category tree TTL < 300s (checked via Redis PTTL), trigger background refresh job without waiting for expiry. Prevents thundering herd on cache miss.

### Slug Uniqueness TOCTOU
**Fix:** On P2002 unique constraint violation: catch → generate new slug with `randomHex(4)` suffix → retry (max 3 attempts). Never fail permanently on slug collision.

### Media Orphan Cleanup TTL
**Fix:** Minimum 24h before orphan cleanup. Tag uploads with session identifier. Only expired sessions with no linked Product are cleanup candidates.

### Seller Business Cache Stale After Suspension
**Document:** Sprint 7 business suspension MUST call `BusinessQueryService.invalidateCache(userId)`. This dependency is captured in Sprint 7 spec.

### SearchReindexJob Table Growth
**Fix:** Weekly cron removes `WHERE processedAt IS NOT NULL AND processedAt < NOW() - INTERVAL '30 days'`. Captured in Sprint 9 maintenance jobs.

### SearchProductDocument Lock Contention
**Fix:** On SPD upsert lock timeout (> 500ms): log warning + enqueue SearchReindexJob for async retry. Do not fail the product write. Use `SET lock_timeout = '500ms'` for SPD upsert within product transaction.

---

## SECTION 18: SPRINT 2 → SPRINT 3 HANDOFF

When Sprint 2 validation gate fully passes (zero failures):

1. Update `context/CURRENT_PHASE.md`:
   - Sprint: Sprint 3 — Inventory Management
   - Sprint 2 tasks: all DONE
   - Sprint 3 tasks: all NOT STARTED

2. Commit:
   ```
   chore(catalog): complete sprint 2 v2.0, marketplace core live on staging
   ```

3. Sprint 3 team reads BEFORE any code:
   - `MASTER_IMPLEMENTATION_ROADMAP.md` — Sprint 3 section
   - `VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` — Inventory, InventoryReservation, InventoryMovement
   - `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — Inventory indexes (idx_inv_prod, idx_invres_inv_stat_exp)
   - `VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Section 20 (Concurrency)
   - `VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Section 5.1 (Inventory Reservation CRITICAL)
   - `context/LOCKED_DECISIONS.md` — Section 3 (optimistic locking)

4. Sprint 3 critical dependency: `Product.id` must exist in DB. Sprint 3 creates Inventory records linked to Product.id. Sprint 3 cannot begin until Sprint 2 gate passes with zero failures.

5. Sprint 3 generates its own Detailed Sprint Implementation Pack before any code is written.

---

**END OF SPRINT 2 FINAL IMPLEMENTATION PACK v2.0**

*This document supersedes SPRINT_2 v1.0 entirely.*
*All segment isolation, seller ownership, search architecture, media pipeline, and segment extensibility decisions made here are permanent.*
*Changes require DDR and CTO approval.*
*No Sprint 3 implementation begins until Sprint 2 v2.0 validation gate passes with zero failures.*

---

*Document: SPRINT_2_FINAL_v2.0.md*
*Authority: VyaparNet Enterprise Architecture Board*
*Prepared by: Principal Enterprise Architect + Senior Distributed Systems Reviewer*
*Audit ref: Sprint 2 Architecture Audit v2.0 (2026-05-27)*
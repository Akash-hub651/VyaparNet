# VYAPARNET — SPRINT 2 DETAILED IMPLEMENTATION PACK
## Marketplace Core Foundation
### Version: v1.0 | Authority: All Architecture Documents + Master Context Pack
### Date: 2025-05-26 | Preceded by: Sprint 1 (Authentication & Identity — COMPLETE)

---

## INTERNAL PRE-GENERATION ANALYSIS

**Re-reading Sprint 2 from MASTER_IMPLEMENTATION_ROADMAP.md:**
Sprint 2 scope: Category tree API (seeded), Product CRUD API, Product image upload pipeline (S3/R2, WebP, 3 variants), Basic search API (PostgreSQL GIN + pg_trgm), Search suggestions API (stub), Segment isolation enforcement, Seller product ownership, Product approval workflow, Product status management, SearchProductDocument sync, Buyer product detail page, Seller product management screen, Buyer search results page, ProductCreated/ProductUpdated → EventOutbox.

**Cross-referencing all architecture documents:**

From `VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md`: Catalog domain models: Category (id, name, slug, description, segment, parentId, imageUrl, displayOrder, isActive, parent/children relations, products), Product (id, name, slug, description, segment, categoryId, businessId, basePrice, mrp, moq, unit, hsnCode, gstPercent, searchVector Unsupported("tsvector"), metaTitle, metaDesc, tags, isActive, isDraft, approvedBy, approvedAt, version, isDeleted — full soft-delete), ProductVariant (id, productId, variantName, sku, price, quantity, reservedQty), ProductMedia (junction: productId, mediaId), Media (id, type, url, thumbnailUrl, name, size, mimeType, isProcessed, uploadedBy, checksum), SearchProductDocument (id, productId, name, searchVector, price, categoryId, segment, sellerId, viewCount, orderCount, lastIndexedAt, needsReindex), SearchReindexJob, CacheInvalidationEvent. EventOutbox already active from Sprint 0 schema.

From `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md`: Tier 1 critical for Sprint 2: idx_prod_search_vector (GIN), idx_prod_name_trgm (GIN, pg_trgm), idx_prod_seg_cat_act (segment+categoryId+isActive WHERE isDeleted=false), idx_prod_biz_act (businessId+isActive WHERE isDeleted=false), idx_prod_slug. Tier 2: idx_cat_seg_active, idx_spd_seg_cat_price_date (SearchProductDocument). GIN indexes must be created via raw SQL (not Prisma). Cursor-based pagination mandatory. Slow query SLA: Product Search p95 < 150ms.

From `VyaparNet_Implementation_Architecture_Official_Freeze_v1.md`: Repository pattern — domain repo extends BaseRepository, never raw Prisma in controllers. Service layer = pure logic. Use Case = orchestration. Transaction boundary design — EventOutbox in same $transaction as domain entity write. Cache-aside pattern for product detail. Search indexing flow: DB Update → Event → BullMQ Worker → sync SearchProductDocument → future OpenSearch. File upload security: MIME validation, 10MB limit, SHA-256 checksum, signed URLs.

From `VyaparNet_PRDv2_Final_Freeze.docx`: Segment isolation — every product has exactly one segmentId, all queries filter by segment. Catalog management — Master Product Catalog + Supplier Offer Catalog + Buyer-Facing Catalog. Soft delete enforced. Optimistic locking via version column. Naming conventions strictly enforced.

From `VyaparNet_DB_Infra_Architecture.md`: Search Architecture — pg_trgm + unaccent + GIN, tsvector trigger on Product name+description. Ranking: ts_rank with weights (Name: 1.0, Description: 0.4). Hindi/English unified search_vector. Transliteration: pre-computed mapping table. Search fallback chain: OpenSearch → PostgreSQL GIN → ILIKE.

From `VyaparNet_Workflow_Sequence_Diagrams_v1.md`: Section 3 (Product creation workflow), Section 4 (Search workflow), Section 21 (Search Rebuild Flow), Section 22 (Cache Failure Matrix). Search: Redis cache-aside, TTL 60s, BullMQ search-reindex queue.

From `VyaparNet_Sprint_Roadmap_v1.md`: Sprint 2 validation gate: 18 items. EXPLAIN ANALYZE must confirm GIN index used. SearchProductDocument created in same transaction. EventOutbox receives events. Segment isolation verified (cross-segment query returns empty). GIN fuzzy match: "kurtee" → "kurti".

From `VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md`: Section 4 — Product CRUD (CreateProductSchema with Zod), GET /products with ProductListQueryDto, Inventory reserve/release. Cursor-based pagination (cursor, limit, sort). Sorting: price:asc/desc, rating:desc, newest. File upload: POST /media/upload.

From `VyaparNet_Product_UX_System_v1.md`: Search-first commerce (70% journeys start with search), sticky search bar, skeleton loaders, segment-specific filters. Product detail: image carousel, WebP, pinch-to-zoom, verified seller badge, MOQ display, stock status, trust badges. Seller product management: 3-step form (info → pricing → images), pending approval state, status badges.

From `VyaparNet_Module_Breakdown_Final_Enterprise_Freeze_v2.docx`: Module 3 (Catalog Engine) — owns products, categories, variants, media, approval workflow. Module 8 (Search Engine) — owns search_queries, search_clicks, search_suggestions. Clear boundary: Search module calls Catalog module's public service — never direct DB access across module boundary. Events published: ProductCreated, ProductUpdated, ProductApproved, ProductRejected, MediaUploaded, CategoryCreated.

**Critical architectural findings for Sprint 2:**

1. **Segment isolation is BINARY** — every single product query must include `segment` filter. This is not optional. A missing segment filter is a data leak bug, not a performance issue. Every repository method must enforce this.

2. **Seller ownership is transitive** — a seller's products are owned by their `Business.id`, not their `User.id`. The link is `Product.businessId = Business.id WHERE Business.ownerId = User.id`. This two-hop ownership check must be resolved at the service layer before any mutation.

3. **Product approval workflow creates two states** — trusted sellers (SELLER_MANAGER, existing sellers with score > threshold) get ACTIVE immediately. New sellers get PENDING_APPROVAL. The approval threshold is a `FeatureFlag`/`AppConfig` value — not hardcoded.

4. **Image upload must be async** — the API returns immediately after uploading to S3. Image processing (resize, WebP conversion, variant generation) happens in a BullMQ worker job. The product creation does not block on image processing. Product goes live when image processing is done (or with placeholder until then).

5. **SearchProductDocument sync must be atomic** — `SearchProductDocument` upsert happens in the SAME Prisma `$transaction` as the `Product` create/update. If the product write succeeds but SearchProductDocument doesn't, search is out of sync. The outbox event for search reindex is also in the same transaction.

6. **GIN index requires `simple` dictionary** — NOT `english` dictionary. The `english` dictionary applies English stemming which breaks Hinglish words. Per `VyaparNet_DB_Infra_Architecture.md`: use `simple` dictionary for both products and SearchProductDocument search_vector triggers to avoid English stemming on Hinglish terms.

7. **SearchSynonym table** — the schema has no explicit SearchSynonym model in v4.3. Hinglish synonyms are handled via `AppConfig` entries or a dedicated lookup during query normalization in SearchService. This is a service-layer concern, not a schema concern.

8. **Media model + ProductMedia** — Media is a standalone entity (supports reuse across products, KYC docs, etc.). ProductMedia is the junction table. A product can have up to 10 Media items. Upload creates Media → links via ProductMedia. This enables the "orphan media cleanup" job from Sprint 0 architecture.

9. **Category tree is segment-scoped** — `Category.segment` field isolates Textile categories from Spare Parts categories. A Category browse for a TEXTILE buyer must never return SPARE_PARTS categories. Same isolation rules as Product.

10. **Cursor-based pagination is mandatory** — OFFSET pagination is explicitly forbidden per `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` Section 16 (OFFSET > 1000 is forbidden). All list queries use cursor on `(createdAt DESC, id DESC)`.

11. **EventOutbox + SearchReindexJob dual-write** — Product create/update writes BOTH an EventOutbox event (for notification consumers) AND a SearchReindexJob record (for search workers) in the same transaction. The SearchReindexJob is the mechanism for keeping SearchProductDocument in sync without requiring real-time processing.

12. **Approved product cache** — product detail is cached in Redis with TTL 300s. Cache key: `product:{id}` and `product:{slug}`. Cache invalidation happens via CacheInvalidationEvent in EventOutbox consumer.

**No architectural conflicts found. Analysis complete.**

---

## SECTION 1: SPRINT IDENTITY

| Field | Value |
|---|---|
| Sprint Number | 2 |
| Sprint Name | Marketplace Core Foundation |
| Duration | 2 weeks (10 working days) |
| Status | READY TO EXECUTE (Sprint 1 gate must be fully passed) |
| Preceded By | Sprint 1 — Authentication & Identity (ALL validation gates must pass) |
| Followed By | Sprint 3 — Inventory Management |
| Critical Path | Yes — inventory (Sprint 3) requires Product.id; orders (Sprint 4) require Product.basePrice; search must work for checkout path |

---

## SECTION 2: REQUIRED ARCHITECTURE CONTEXT FILES

Every AI agent and engineer executing Sprint 2 MUST read these files before writing a single line.

| Context Type | Authoritative File | Why Required |
|---|---|---|
| Schema — Catalog Domain | `architecture/database/VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` — Category, Product, ProductVariant, ProductMedia, Media, SearchProductDocument | Complete model definitions for all catalog entities |
| Indexing Strategy | `architecture/database/VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — Sections 6.2, 7, 8 | GIN index strategy, search hot path, partial indexes |
| DB Infra — Search | `architecture/database/VyaparNet_DB_Infra_Architecture.md` — Sections 4, 2 | FTS implementation, segment isolation, trigger SQL |
| Module Architecture | `architecture/modules/VyaparNet_Module_Breakdown_Final_Enterprise_Freeze_v2.docx` — Modules 2, 3, 8 | Catalog Engine, Search Engine boundaries, event contracts |
| Implementation Patterns | `architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Sections 3, 4, 5, 13, 14, 15 | Repository pattern, service/use-case layer, outbox, caching, search indexing flow |
| API Contracts | `architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — Section 4 | Product CRUD DTOs, search query params, file upload |
| Workflow Sequences | `architecture/workflows/VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Sections 3, 4, 21, 22 | Product creation flow, search workflow, search rebuild, cache failure |
| Runtime | `architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md` — Sections 7, 9 | CDN/asset delivery, Redis cache governance, image pipeline |
| UX System | `architecture/ux/VyaparNet_Product_UX_System_v1.md` — Sections 7, 8, 9.2–9.4 | Search-first UX, category navigation, product detail, seller forms |
| IA — Discovery | `architecture/ux/VyaparNet_IA_Final_Master_Freeze_v3.docx` — Sections 8, 9 | Segment-specific IA, search/discovery architecture |
| Governance | `context/LOCKED_DECISIONS.md` | Module boundaries, forbidden patterns, naming |
| Project Context | `context/PROJECT_CONTEXT.md` | Anti-patterns, AI rules, runtime guarantees |
| Sprint Authority | `implementation/master-roadmap/MASTER_IMPLEMENTATION_ROADMAP.md` — Sprint 2 | Deliverables, validation gate, failure conditions |
| Sprint 1 | `implementation/sprints/SPRINT_1.md` | Auth infrastructure, guard patterns, existing module patterns |
| PRD | `architecture/prd/VyaparNet_PRDv2_Final_Freeze.docx` — Sections 13, 20 | Database foundations, segment isolation principles |

---

## SECTION 3: SPRINT OBJECTIVE

Sprint 2 establishes the commercial heart of VyaparNet. Without a searchable, segment-isolated product catalog owned by verified sellers, there is no marketplace. At the end of Sprint 2:

- Sellers can create, manage, and publish products with images
- Buyers can search products using fast PostgreSQL GIN full-text search with Hinglish fuzzy matching
- Every product is segment-isolated — a TEXTILE buyer never sees SPARE_PARTS products
- Product approval workflow operates: new sellers go through PENDING_APPROVAL, trusted sellers go ACTIVE immediately
- Product images are processed asynchronously (resize, WebP, 3 variants, CDN delivery)
- The search index (SearchProductDocument) is kept synchronized via atomic writes
- All product mutations emit domain events to the EventOutbox
- Both buyer-facing search/discovery UI and seller product management UI are functional

**Sprint 2 does NOT implement:**
- Inventory reservation or stock levels (Sprint 3)
- Cart or order placement (Sprint 4)
- Product pricing rules or supplier offers beyond base price (Sprint 7)
- Product reviews or ratings (Sprint 5)
- OpenSearch migration (Phase 2)
- Advanced analytics or trending search (Phase 2)
- Bulk CSV product upload (Phase 2)

---

## SECTION 4: SPRINT PHILOSOPHY

> *"The catalog is the commercial foundation. If search is wrong, buyers can't find products. If segment isolation is wrong, trust collapses. If product ownership is wrong, sellers lose control. If image delivery is wrong, the platform feels broken. Sprint 2 is where VyaparNet becomes a real marketplace — or doesn't. There is no middle ground."*

**Four absolute constraints for Sprint 2:**

1. **Segment isolation is absolute.** Every product query — list, search, detail — must carry a `segment` filter enforced at the repository layer. A query that returns cross-segment results is a critical bug, not a minor issue. Test this explicitly.

2. **Seller ownership is two-hop and server-enforced.** `Product.businessId` → `Business.ownerId` → `User.id`. This ownership chain is verified server-side on every mutation. Client cannot override it.

3. **Search uses `simple` tsvector dictionary, not `english`.** The English dictionary stems words (running→run, sarees→saree) which destroys Hinglish term matching. `simple` dictionary preserves exact words and enables better fuzzy matching with pg_trgm. This is established in the migration SQL from Sprint 0 but must be verified.

4. **EventOutbox write is atomic with product write.** The search reindex job and the domain event are written in the SAME Prisma `$transaction` as the product create/update. Eventual consistency is intentional. Broken sync (product exists but no EventOutbox entry) is a reliability failure.

---

## SECTION 5: ARCHITECTURAL PRINCIPLES

### 5.1 Segment Isolation Architecture

```
SEGMENT ISOLATION RULES (Authority: VyaparNet_PRDv2_Final_Freeze.docx Section 20):

  Every query touching a segment-scoped table:
    WHERE product.segment = :userSegment

  Enforced at: Repository layer (not controller, not service)
  Repository methods signature: findMany(segment: Segment, ...otherFilters)
  Never: findMany(...otherFilters) without segment
  
  Category tree: also segment-scoped
  Search results: segment-scoped (search_vector index is global, filter is not)
  SearchProductDocument: segment field on every row
  
  Cross-segment access:
    Allowed: ADMIN role (explicitly)
    Forbidden: BUYER, SELLER (by default, enforced in repository)
```

### 5.2 Product Ownership Model

```
OWNERSHIP CHAIN:
  User.id → Business.ownerId → Business.id → Product.businessId

VERIFICATION PATTERN (must be in ProductService, not controller):
  async verifySellerOwnership(userId: string, productId: string): Promise<Business> {
    const product = await productRepo.findById(productId);
    const business = await businessRepo.findByOwnerId(userId);
    if (!business || product.businessId !== business.id) {
      throw ForbiddenException;
    }
    return business;
  }

WHY: A user could theoretically have businessId from another route.
Server-side ownership verification prevents privilege escalation.

APPROVAL LOGIC:
  New seller (first product): → PENDING_APPROVAL
  Trusted seller (AppConfig.SELLER_AUTO_APPROVE_THRESHOLD score): → ACTIVE
  SELLER_MANAGER / ADMIN: → ACTIVE immediately
  Rule stored in AppConfig, not hardcoded.
```

### 5.3 Image Pipeline Architecture

```
REQUEST PATH (synchronous):
  Client uploads image
  → API validates (MIME, size, dimensions)
  → API uploads to S3/R2 (original file)
  → API creates Media record (status: PENDING_PROCESSING)
  → API links ProductMedia
  → API returns product with placeholder/original URL
  → Client gets response immediately

PROCESSING PATH (asynchronous, BullMQ):
  search-reindex queue receives MediaProcessingJob
  → Worker downloads from S3
  → Worker generates WebP variants (thumb/200px, medium/400px, large/800px)
  → Worker uploads variants to S3
  → Worker updates Media record (status: PROCESSED, thumbnailUrl updated)
  → Worker emits CacheInvalidationEvent for product cache

WHY ASYNC:
  Image processing (sharp) is CPU-intensive.
  Blocking the API thread for image processing violates stateless API principle.
  Product is immediately searchable after creation.
  Images improve after background processing (graceful degradation).

CDN DELIVERY:
  All image URLs in Media.url → CloudFront signed URL (5-minute TTL)
  Public product images (not KYC): Cache-Control: public, max-age=604800 (7 days)
  Thumbnails served from CDN edge, not API
```

### 5.4 Search Architecture

```
SEARCH STACK (MVP):
  Query → SearchService.searchProducts() → PostgreSQL $queryRaw
  GIN index on search_vector (tsvector) → ts_rank ranking
  pg_trgm GIN index on name → fuzzy matching for typos/transliteration
  unaccent → accent normalization

QUERY PROCESSING:
  Raw query → SearchNormalizer.normalize()
    → toLowerCase()
    → trim()
    → remove special chars
    → Hinglish synonym expansion (from AppConfig/SearchSynonym lookup)
    → return normalized query string

RANKING FORMULA (ts_rank weights):
  setweight(to_tsvector('simple', name), 'A')        weight 1.0
  setweight(to_tsvector('simple', description), 'B') weight 0.4
  Combined as search_vector tsvector column via trigger

FALLBACK CHAIN:
  GIN search → (if returns 0 results) → ILIKE fallback on name
  Search API: always returns results (never empty with fallback)
  Show: "Exact match nahi mila — related results dikh rahe hain"

RESULT CACHING:
  Cache key: search:v1:{segment}:{normalizedQuery}:{filterHash}:{page}
  TTL: 60 seconds
  Cache invalidation: triggered by ProductUpdated/ProductCreated events (async)

SEARCH ANALYTICS:
  Every search query logged to SearchAnalytics table (async, via queue)
  Fields: query, segment, userId?, resultsCount, clickedProductId, isAbandoned
  Used for: trending searches, synonym improvement, catalog gaps
```

### 5.5 EventOutbox + Search Sync Pattern

```
ATOMIC WRITE (every product mutation):
  prisma.$transaction(async (tx) => {
    product = await tx.product.upsert(...)
    
    // Sync SearchProductDocument in same transaction
    await tx.searchProductDocument.upsert({
      where: { productId: product.id },
      create: { productId: product.id, name: product.name, ... },
      update: { name: product.name, price: product.basePrice, needsReindex: true }
    })
    
    // Queue search reindex job (outbox pattern)
    await tx.searchReindexJob.create({
      data: { entityType: 'Product', entityId: product.id, priority: 0 }
    })
    
    // Domain event for notification/analytics consumers
    await tx.eventOutbox.create({
      data: {
        eventType: 'ProductCreated',
        payload: { productId: product.id, segment, sellerId },
        status: 'PENDING',
        deduplicationKey: `product-${product.id}-created-${Date.now()}`,
        eventMonth: currentMonth()
      }
    })
  })

WHY: If transaction fails → no partial state. Search is always consistent with DB.
Search reindex worker processes SearchReindexJob queue asynchronously.
```

---

## SECTION 6: BUSINESS, TECHNICAL & DEPENDENCY REASONING

### Business Reasoning

A B2B marketplace without a reliable product catalog is a database, not a business. Sprint 2 is where sellers become productive (listing products), buyers become active (finding products), and VyaparNet becomes a platform rather than infrastructure. The segment isolation and seller ownership models established here directly underpin the trust architecture that VyaparNet's entire business model is built on.

### Technical Reasoning

Sprint 3 (Inventory) creates `Inventory` records linked to `Product.id`. Sprint 4 (Orders) creates `OrderItem` with product price snapshots from `Product.basePrice`. Both are impossible without Sprint 2's Product domain.

The SearchProductDocument table established in Sprint 2 is the sync layer between PostgreSQL and the future OpenSearch cluster. Every product mutation in Sprint 2 keeps this table synchronized, so the OpenSearch migration in Phase 2 is a read-path switch, not a data migration.

### Dependency Reasoning

Sprint 2 depends on Sprint 1:
- `Business.ownerId` → `User.id` (established Sprint 1 onboarding)
- `@CurrentUser()` decorator → `seller: JwtPayload` with `seller.sub` = userId
- `PrismaService`, `RedisService`, `BullMQModule` — Sprint 0/1
- `AuditRepository` pattern — Sprint 1 (reused for product audit events)
- `packages/types` — Sprint 1 enums (UserRole, Segment) + Sprint 2 adds product enums
- `GlobalExceptionFilter` → standard error envelope — Sprint 0

---

## SECTION 7: DETAILED SCOPE

### IN SCOPE — Sprint 2

**packages/types (new shared types):**
- `ProductStatus` enum (DRAFT, ACTIVE, PENDING_APPROVAL, REJECTED, ARCHIVED)
- `MediaType` enum (IMAGE, VIDEO, DOCUMENT, AUDIO, PDF, THREED_MODEL)
- `CategoryDto`, `ProductDto`, `ProductListQueryDto`, `SearchQueryDto`
- Zod schemas: `CreateProductSchema`, `UpdateProductSchema`, `ProductSearchSchema`
- `ProductSearchResult`, `ProductDetailResponse`, `CategoryTreeResponse`

**modules/catalog (NestJS):**
- `CatalogModule` (root)
- `CategoryModule` — read-only category tree (seeded data), segment-scoped
- `ProductModule` — CRUD, approval workflow, ownership enforcement
- `MediaModule` — upload pipeline, S3 integration, image processing queue
- `SearchModule` — GIN full-text search, fuzzy matching, query normalization, result caching

**Category APIs:**
- `GET /api/v1/categories` — segment-scoped tree
- `GET /api/v1/categories/:id` — single category with children

**Product APIs:**
- `POST /api/v1/products` — create (seller-owned, approval-aware)
- `GET /api/v1/products` — segment-scoped list (paginated, filtered)
- `GET /api/v1/products/:id` — detail with media, cached
- `PUT /api/v1/products/:id` — update (seller-owned)
- `DELETE /api/v1/products/:id` — soft delete (seller-owned)
- `GET /api/v1/products/seller` — seller's own products (all statuses)

**Search APIs:**
- `GET /api/v1/search/products` — GIN search with segment isolation
- `GET /api/v1/search/suggestions` — recent + trending (stub)

**Media APIs:**
- `POST /api/v1/media/upload` — upload product image, return Media record
- `DELETE /api/v1/media/:id` — remove media (seller-owned)

**Database models activated (data level):**
- `Category` — seeded with Textile + Spare Parts trees
- `Product` — full CRUD with search trigger
- `ProductVariant` — stub activation (no UI yet, Sprint 3 adds inventory per variant)
- `ProductMedia` — junction table
- `Media` — uploads, checksum, processing status
- `SearchProductDocument` — synchronized in product transactions
- `SearchReindexJob` — queued in product transactions
- `CacheInvalidationEvent` — written on product update for cache busting
- `SearchAnalytics` — async logging on every search query

**BullMQ workers (new):**
- `ImageProcessingWorker` — processes `search-reindex` queue jobs for image processing
- `SearchReindexWorker` — processes `search-reindex` queue jobs for SearchProductDocument sync

**Redis keys established:**
- `product:{id}` → TTL 300s (product detail cache)
- `product:{slug}` → TTL 300s
- `search:v1:{segment}:{queryHash}` → TTL 60s (search result cache)
- `categories:{segment}` → TTL 3600s (category tree cache)
- `trending:{segment}` → TTL 300s (trending products stub)

**Observability:**
- `product_created_total{segment}`, `product_updated_total`, `product_search_total{segment}`
- `product_search_latency_ms`, `media_upload_total`, `media_processing_latency_ms`
- `search_zero_results_total{segment}`, `search_cache_hit_rate`
- Grafana alerts: search p95 > 300ms, zero results rate > 20%

**Seed data:**
- Complete Textile category tree (7 categories + subcategories)
- Complete Spare Parts category tree (vehicle hierarchy)
- `SearchSynonym` AppConfig entries (kurti/kurtee/kurta-set, saree/sari, etc.)

**Frontend (apps/web):**
- Buyer search results page (sticky search bar, filter pills, skeleton grid, cursor pagination)
- Buyer product detail page (image carousel, specs, MOQ, stock status stub, trust badges)
- Seller product list page (status tabs, search, bulk actions stub)
- Seller product create/edit form (3-step: info → pricing → images)
- Search API client (typed, Zod-validated query params)
- Product API client (typed responses)

### OUT OF SCOPE — Sprint 2

| Item | Sprint |
|---|---|
| Inventory stock levels and reservation | Sprint 3 |
| Cart and order placement | Sprint 4 |
| Payment and checkout | Sprint 4 |
| Product reviews and ratings | Sprint 5 |
| Supplier offers and pricing rules | Sprint 7 |
| Invoice and tax calculation | Sprint 7 |
| Bulk CSV product upload | Phase 2 |
| OpenSearch integration | Phase 2 |
| AI-assisted product tagging | Phase 3 |
| Product recommendation engine | Phase 3 |
| WhatsApp product ingestion | Phase 2 |
| Vehicle compatibility matrix for Spare Parts | Phase 2 |

---

## SECTION 8: CATALOG DOMAIN DESIGN

### 8.1 Category Architecture

```
CATEGORY MODEL (from schema v4.3):
  id, name, slug (unique), description, segment (Segment enum),
  parentId (self-FK for hierarchy), imageUrl, displayOrder,
  isActive, isDeleted, parent/children relations, products

TREE STRUCTURE:
  TEXTILE segment:
    Sarees → {Silk, Cotton, Synthetic, Blend}
    Kurtis → {Straight, Anarkali, A-Line, Palazzo Set}
    Fabrics → {Cotton Fabric, Silk Fabric, Synthetic Fabric, Georgette}
    Dress Materials → {Cotton Dress Material, Synthetic Dress Material}
    Men's Wear → {Shirts, Kurtas, Trousers}
    Women's Ethnic → {Lehengas, Blouses, Dupattas}
    Kids Wear → {Boys Wear, Girls Wear}

  SPARE_PARTS segment:
    2-Wheeler → {Brakes, Engine Parts, Electrical, Body Parts, Filters, Lubricants}
    4-Wheeler → {Brakes, Engine Parts, Electrical, Body Parts, Filters, Lubricants}
    Truck & HCV → {Brakes, Engine Parts, Clutch, Tyres}
    Accessories → {Tools, Cleaning, Maintenance}
    Lubricants → {Engine Oil, Gear Oil, Grease}

CACHING:
  Category tree is immutable (admin-only changes, rare).
  Cache entire tree per segment: categories:{segment} → TTL 3600s
  Cache invalidation: admin category update → DEL categories:{segment}
  
QUERY PATTERN:
  GET /categories?segment=TEXTILE
  → Redis cache hit → return tree
  → Cache miss → DB query (recursive CTE or include children)
  → Store in Redis

SEED STRATEGY:
  packages/database/prisma/seed.ts
  Upsert (not insert) all categories — idempotent seed
  Run in: prisma/seed.ts during staging setup
  DO NOT: drop and recreate categories (data dependency from products)
```

### 8.2 Product Lifecycle State Machine

```
PRODUCT STATES (ProductStatus enum — add to packages/types):
  DRAFT          → Created, not submitted for review
  PENDING_APPROVAL → Submitted, awaiting admin approval (new sellers)
  ACTIVE         → Live, visible to buyers, searchable
  REJECTED       → Admin rejected (with reason)
  ARCHIVED       → Seller archived (soft removed from catalog)

VALID TRANSITIONS:
  DRAFT → PENDING_APPROVAL (seller submits)
  DRAFT → ACTIVE (trusted seller: auto-approve)
  PENDING_APPROVAL → ACTIVE (admin approves)
  PENDING_APPROVAL → REJECTED (admin rejects)
  REJECTED → DRAFT (seller can edit and resubmit)
  ACTIVE → ARCHIVED (seller archives)
  ARCHIVED → ACTIVE (seller reactivates)
  ACTIVE → PENDING_APPROVAL (if seller edits price significantly — configurable)

APPROVAL LOGIC:
  Trusted seller threshold → AppConfig key: SELLER_AUTO_APPROVE_THRESHOLD (default: 0)
  If seller.trustScore >= threshold → ACTIVE immediately
  If seller.trustScore < threshold → PENDING_APPROVAL
  SELLER_MANAGER, ADMIN → always ACTIVE
  
  AppConfig read at product creation time.
  Future: cache AppConfig in Redis with 5-min TTL.

SEARCH VISIBILITY:
  Only ACTIVE products appear in search results.
  PENDING_APPROVAL: seller can see in seller dashboard, buyers cannot.
  REJECTED: seller can see with rejection reason.
  DRAFT: seller can see, never visible to buyers.
  ARCHIVED: never visible to buyers or in search.
```

### 8.3 Media Model Design

```
MEDIA LIFECYCLE:
  Upload → PENDING_PROCESSING → PROCESSED (after image worker)
                             ↘ FAILED (if worker fails after 3 retries)

MEDIA FIELDS (from schema v4.3):
  id, type (MediaType), url (original S3 URL), thumbnailUrl (CDN URL after processing)
  name (original filename — sanitized), size (bytes), mimeType
  isProcessed (bool), uploadedBy (User FK), checksum (SHA-256)
  isDeleted, deletedAt

S3 KEY STRATEGY:
  Format: media/{userId}/{productId}/{uuid}.{ext}
  Example: media/usr-abc/prd-xyz/f47ac10b-58cc-4372-a567-0e02b2c3d479.jpg
  Never: user-provided filenames as S3 keys (path traversal risk)
  Always: UUID-based keys

VARIANT STRATEGY:
  Original: media/{userId}/{productId}/{uuid}.jpg (uploaded as-is)
  Thumb:    media/{userId}/{productId}/{uuid}-thumb.webp (200x200, crop)
  Medium:   media/{userId}/{productId}/{uuid}-medium.webp (400x400, fit)
  Large:    media/{userId}/{productId}/{uuid}-large.webp (800x800, fit)

CDN SIGNED URL:
  Public product images: 7-day CloudFront cache, public URLs (not signed)
  KYC documents: 5-minute signed URLs (private bucket)
  Product images go to PUBLIC bucket — buyers must be able to view them
  
CHECKSUM:
  SHA-256 of original file computed at upload
  Stored in Media.checksum
  Duplicate detection: if same checksum already exists → reuse Media record

MIME VALIDATION:
  Accepted: image/jpeg, image/png, image/webp
  Rejected: everything else (return 400 with clear message)
  Implementation: check both Content-Type header AND magic bytes (first 4 bytes)
  Magic bytes check prevents MIME spoofing
```

### 8.4 Search Query Design

```
SEARCH API CONTRACT:
  GET /api/v1/search/products
  Query params:
    q: string (required, min 1 char)
    segment: Segment (required — no cross-segment search)
    categoryId: string (optional UUID)
    minPrice: number (optional)
    maxPrice: number (optional)
    inStock: boolean (optional — stub in Sprint 2, inventory in Sprint 3)
    sort: 'relevance' | 'price:asc' | 'price:desc' | 'newest' (default: relevance)
    cursor: string (optional — base64 encoded cursor)
    limit: number (optional, default 20, max 100)

SEARCH SQL PATTERN (PostgreSQL $queryRaw):
  WITH query AS (
    SELECT to_tsquery('simple', :normalizedQuery) AS tsq
  )
  SELECT
    p.id, p.name, p.slug, p.base_price, p.moq,
    p.segment, p.category_id, p.business_id,
    ts_rank(p.search_vector, q.tsq) AS rank,
    pm_thumb.url AS thumbnail_url
  FROM "Product" p
  CROSS JOIN query
  LEFT JOIN "ProductMedia" pm ON pm.product_id = p.id
  LEFT JOIN "Media" pm_thumb ON pm_thumb.id = pm.media_id AND pm_thumb.is_processed = true
  WHERE
    p.segment = :segment
    AND p.is_active = true
    AND p.is_deleted = false
    AND p.search_vector @@ q.tsq
    [AND p.category_id = :categoryId -- if provided]
    [AND p.base_price >= :minPrice -- if provided]
    [AND p.base_price <= :maxPrice -- if provided]
    [AND (createdAt, id) < (:cursorDate, :cursorId) -- cursor pagination]
  ORDER BY rank DESC, p.created_at DESC, p.id DESC
  LIMIT :limit;

FUZZY FALLBACK (when GIN returns 0 results):
  If ts_rank query returns 0 rows:
  SELECT ... FROM "Product" p
  WHERE p.segment = :segment AND p.is_active = true AND p.is_deleted = false
  AND p.name ILIKE '%' || :rawQuery || '%'
  LIMIT :limit;

HINGLISH NORMALIZATION:
  Normalization table (stored in AppConfig or dedicated table):
    "kurtee" → "kurti"
    "sari" → "saree"
    "kurta set" → "kurti"
    "brake shoe" → "brake"
    "activa" → "activa honda"
  
  SearchNormalizer.normalize(query):
    1. Lowercase, trim, remove special chars
    2. Lookup synonym map (AppConfig or Redis-cached lookup)
    3. Expand: "kurtee" → "kurti kurtee" (add both terms)
    4. Return expanded query string for ts_to_tsquery
    
  Query format for tsquery:
    Multi-word: "red kurti" → "red & kurti"
    With synonym: "kurtee" → "kurti | kurtee"
    Prefix match (for autocomplete stub): append :* to last term
```

---

## SECTION 9: MODULE ARCHITECTURE

### 9.1 Module Structure

```
apps/api/src/modules/
└── catalog/
    ├── catalog.module.ts                 ← Root catalog module
    │
    ├── categories/
    │   ├── categories.module.ts
    │   ├── categories.controller.ts
    │   ├── categories.service.ts
    │   ├── categories.repository.ts
    │   └── tests/
    │       └── categories.service.spec.ts
    │
    ├── products/
    │   ├── products.module.ts
    │   ├── products.controller.ts
    │   ├── products.service.ts           ← Orchestration layer
    │   ├── product-approval.service.ts   ← Approval workflow
    │   ├── product-ownership.service.ts  ← Ownership verification
    │   ├── products.repository.ts        ← DB access
    │   ├── product-events.service.ts     ← EventOutbox emission
    │   └── tests/
    │       ├── products.service.spec.ts
    │       └── products.ownership.spec.ts
    │
    ├── media/
    │   ├── media.module.ts
    │   ├── media.controller.ts
    │   ├── media.service.ts
    │   ├── media.repository.ts
    │   ├── storage.interface.ts          ← S3 abstraction
    │   ├── s3-storage.service.ts
    │   ├── image-validator.service.ts    ← MIME, magic bytes, size
    │   └── workers/
    │       └── image-processing.worker.ts
    │
    └── search/
        ├── search.module.ts
        ├── search.controller.ts
        ├── search.service.ts
        ├── search.repository.ts          ← $queryRaw search queries
        ├── search-normalizer.service.ts  ← Hinglish normalization
        ├── search-cache.service.ts       ← Redis search cache
        └── tests/
            ├── search.service.spec.ts
            └── search-normalizer.spec.ts

packages/types/src/
├── catalog/
│   ├── product.schemas.ts                ← Zod schemas
│   ├── search.schemas.ts
│   └── enums.ts                          ← ProductStatus, MediaType

packages/database/prisma/seed.ts          ← Category tree seed (updated)
```

### 9.2 Module Boundary Rules

```
CATALOG MODULE INTERNAL BOUNDARIES:
  CategoriesModule → no dependencies on other catalog sub-modules
  ProductsModule → depends on: CategoriesModule (category validation), MediaModule (media linking)
  MediaModule → no dependencies on other catalog sub-modules
  SearchModule → depends on: ProductsModule public service (segment validation)

CROSS-MODULE BOUNDARIES:
  CatalogModule exports: ProductsService (public API), CategoriesService (public API)
  IdentityModule (Sprint 1) provides: UsersRepository (business lookup for ownership)
  
  ProductsModule imports UsersRepository via IdentityModule.exports
  This is the ONLY allowed cross-domain import.
  
  FORBIDDEN:
    SearchModule cannot import ProductsRepository directly.
    SearchModule can only call ProductsService.getProduct() or SearchRepository directly.
    MediaModule cannot import ProductsRepository directly.

EVENTS (not imports):
  ProductCreated → EventOutbox → consumed by: SearchReindexWorker, NotificationWorker (Sprint 6)
  ProductUpdated → EventOutbox → consumed by: SearchReindexWorker, CacheInvalidationWorker
  ProductApproved → EventOutbox → consumed by: NotificationWorker (Sprint 6)
```

---

## SECTION 10: DATABASE FOUNDATION

### 10.1 Models Activated in Sprint 2

All models exist in schema v4.3 from Sprint 0. Sprint 2 activates them via application code.

**No new Prisma schema migrations required in Sprint 2.** All models, indexes, and triggers are already applied from Sprint 0's migration.

### 10.2 Critical Index Verification

Before Sprint 2 code deploys to staging, verify all Sprint 2 indexes are active:

```sql
-- Run on staging PostgreSQL:
SELECT indexname, indexdef, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes psi
JOIN pg_indexes pi ON psi.indexrelname = pi.indexname
WHERE psi.indexrelname IN (
  'idx_prod_search_vector',
  'idx_prod_name_trgm',
  'idx_prod_seg_cat_act',
  'idx_prod_biz_act',
  'idx_prod_slug',
  'idx_cat_seg_active',
  'idx_spd_seg_cat_price_date',
  'idx_srj_entity_proc'
);
-- All 8 must be present

-- Verify search trigger exists
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN ('product_search_trigger', 'search_doc_trigger');
-- Both must be present

-- Verify extensions active
SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent');
-- Both must be present
```

### 10.3 Transaction Boundaries (Sprint 2)

```
PRODUCT CREATE (ATOMIC):
  prisma.$transaction(async (tx) => {
    // 1. Create product
    product = await tx.product.create({ data: { ...productData, isDraft: false } })
    
    // 2. Link media if provided
    if (mediaIds.length > 0) {
      await tx.productMedia.createMany({ data: mediaIds.map(id => ({ productId: product.id, mediaId: id })) })
    }
    
    // 3. Sync SearchProductDocument (search consistency)
    await tx.searchProductDocument.upsert({
      where: { productId: product.id },
      create: { productId: product.id, name: product.name, price: product.basePrice, ... },
      update: { name: product.name, price: product.basePrice, needsReindex: true }
    })
    
    // 4. Queue search reindex
    await tx.searchReindexJob.create({
      data: { entityType: 'Product', entityId: product.id, priority: 0 }
    })
    
    // 5. Domain event (for notification consumers)
    await tx.eventOutbox.create({
      data: {
        eventType: 'ProductCreated',
        payload: { productId: product.id, segment: product.segment, sellerId: product.businessId },
        status: 'PENDING',
        deduplicationKey: `product-${product.id}-created`,
        eventMonth: currentMonth()
      }
    })
    
    // 6. AuditLog (immutable)
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'CREATE',
        entityType: 'Product',
        entityId: product.id,
        entityName: product.name,
        auditMonth: currentMonth()
      }
    })
    
    return product;
  })

PRODUCT UPDATE (ATOMIC — same pattern with UPDATE actions):
  Additional step: emit CacheInvalidationEvent for product cache busting

ROLLBACK: All 6 operations roll back atomically if any fails.
```

### 10.4 Repository Design

```
ProductRepository:
  // ALL queries include isDeleted = false
  // ALL non-admin queries include segment filter
  
  findById(id: string, segment: Segment): Promise<Product | null>
  findBySlug(slug: string, segment: Segment): Promise<Product | null>
  findBySellerId(businessId: string, options: PaginationOptions): Promise<PaginatedResult<Product>>
  findMany(segment: Segment, filters: ProductFilters, pagination: CursorPagination): Promise<PaginatedResult<Product>>
  create(data: CreateProductInput): Promise<Product>
  update(id: string, data: UpdateProductInput): Promise<Product>
  softDelete(id: string): Promise<void>
  updateStatus(id: string, status: ProductStatus, approver?: string): Promise<Product>
  
  // Admin only — no segment filter
  findByIdAdmin(id: string): Promise<Product | null>
  findPendingApproval(): Promise<Product[]>

CategoryRepository:
  findTree(segment: Segment): Promise<Category[]>
  findById(id: string, segment: Segment): Promise<Category | null>
  findChildren(parentId: string, segment: Segment): Promise<Category[]>

SearchRepository:
  // Uses $queryRaw — PostgreSQL parameterized queries only
  fullTextSearch(params: SearchParams): Promise<SearchResult[]>
  fuzzyFallback(query: string, segment: Segment, limit: number): Promise<SearchResult[]>
  
  // IMPORTANT: never accept raw query string without normalization
  // Always: query = normalizer.normalize(rawQuery) before passing to repository

MediaRepository:
  findById(id: string): Promise<Media | null>
  findByChecksum(checksum: string): Promise<Media | null>
  create(data: CreateMediaInput): Promise<Media>
  markProcessed(id: string, thumbnailUrl: string): Promise<void>
  softDelete(id: string): Promise<void>
```

---

## SECTION 11: STEP-BY-STEP IMPLEMENTATION SEQUENCE

---

### PHASE 1: SHARED TYPES EXPANSION
**Estimated time: Day 1 morning**
**Required Context Files:** schema v4.3, API contracts Section 4, LOCKED_DECISIONS.md naming conventions

---

#### Step 1.1 — Add Catalog Enums to packages/types

```
AUTHORITY: VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md (enum definitions)
           VyaparNet_PRDv2_Final_Freeze.docx Section 4 (naming)

Add to packages/types/src/enums/index.ts:

  ProductStatus enum — DRAFT, PENDING_APPROVAL, ACTIVE, REJECTED, ARCHIVED
  MediaType enum — IMAGE, VIDEO, DOCUMENT, AUDIO, PDF, THREED_MODEL

These mirror Prisma schema enums EXACTLY.
No additions, no removals.

AI AGENT RULE: Copy enum values from schema document exactly.
```

#### Step 1.2 — Add Product Zod Schemas

```
AUTHORITY: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 4
           VyaparNet_PRDv2_Final_Freeze.docx Section 4 (naming, validation rules)

Create: packages/types/src/catalog/product.schemas.ts

Schemas to define:
  CreateProductSchema:
    - name: string min(3) max(200)
    - description: string max(5000) optional
    - categoryId: string uuid
    - basePrice: number positive min(1)
    - mrp: number positive optional
    - moq: number int min(1) default(1)
    - unit: string max(20) (e.g., "piece", "meter", "kg", "bundle")
    - segment: Segment enum (required)
    - hsnCode: string optional
    - gstPercent: number min(0) max(28) optional
    - tags: string[] max(10) optional
    - mediaIds: string[] uuid[] max(10) optional
    
  UpdateProductSchema:
    Partial version of CreateProductSchema
    Plus: status field for seller archive/reactivate
    
  ProductSearchSchema:
    - q: string min(1) max(500)
    - segment: Segment (required)
    - categoryId: string uuid optional
    - minPrice: number positive optional
    - maxPrice: number positive optional
    - inStock: boolean optional
    - sort: enum('relevance', 'price:asc', 'price:desc', 'newest') default('relevance')
    - cursor: string optional
    - limit: number int min(1) max(100) default(20)
    
  ProductListQuerySchema:
    (for GET /products — seller/admin listing)
    - segment: Segment (required)
    - categoryId: string uuid optional
    - status: ProductStatus optional
    - cursor: string optional
    - limit: number int default(20) max(100)
    - sortBy: enum('createdAt', 'price', 'name') default('createdAt')
    - sortOrder: enum('asc', 'desc') default('desc')

Response types (TypeScript interfaces, not Zod):
  ProductDetailResponse: full product with media URLs, category, business summary
  ProductSummaryResponse: list item — id, name, slug, basePrice, moq, unit, thumbnailUrl, status
  SearchResultResponse: search result item — id, name, slug, basePrice, thumbnailUrl, rank
  CategoryTreeResponse: hierarchical category with children

Install zod in packages/types if not already present from Sprint 1.
```

#### Step 1.3 — Update packages/types Index

```
Update packages/types/src/index.ts to re-export:
  All new catalog enums
  All catalog schemas and types
  
Build packages/types BEFORE any app code uses it.
Turbo pipeline dependency already handles this (packages/types builds before apps).
```

---

### PHASE 2: CATEGORY MODULE
**Estimated time: Day 1 afternoon**
**Required Context Files:** schema v4.3 (Category model), DB Infra Section 4, Sprint 0 repository pattern

---

#### Step 2.1 — Category Repository

```
AUTHORITY: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 3
           VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md (Category model)

CategoryRepository:
  findTree(segment: Segment): Promise<Category[]>
    Query: All categories WHERE segment=:segment AND isDeleted=false AND isActive=true
    Include: children (nested)
    Cache pattern: check Redis first (categories:{segment} → TTL 3600s)
    
  findById(id: string, segment: Segment): Promise<Category | null>
    WHERE id=:id AND segment=:segment AND isDeleted=false
    
  findChildren(parentId: string, segment: Segment): Promise<Category[]>
    WHERE parentId=:parentId AND segment=:segment AND isDeleted=false

CACHING:
  Repository reads from Redis first (cache-aside pattern from Sprint 0 architecture).
  On cache miss: DB query → cache result → return.
  TTL: 3600s (1 hour) for category tree (rarely changes).
  Invalidation: admin category changes (Sprint 7) will clear this key.
```

#### Step 2.2 — Category Service

```
CategoriesService:
  getTree(segment: Segment): Promise<CategoryTreeResponse>
    → CategoryRepository.findTree()
    → Transform to CategoryTreeResponse (hierarchical DTO)
    → Never return raw Prisma entity
    
  getById(id: string, segment: Segment): Promise<CategoryTreeResponse | null>
    → Validate segment match (category must belong to buyer's segment)
    → Return with children

CategoryController:
  GET /api/v1/categories → getTree (segment from query param, required)
  GET /api/v1/categories/:id → getById
  Both: @Public() — no auth required for browsing categories
```

#### Step 2.3 — Category Seed Data

```
AUTHORITY: packages/database/prisma/seed.ts (Sprint 0 stub — now populated)

Strategy: Upsert all categories (idempotent — safe to re-run).
Format: slug must be URL-safe, lowercase, hyphenated.

Textile categories (segment: TEXTILE):
  Parent: sarees (slug: sarees)
    Children: silk-sarees, cotton-sarees, synthetic-sarees, blend-sarees
  Parent: kurtis (slug: kurtis)
    Children: straight-kurtis, anarkali-kurtis, aline-kurtis, palazzo-sets
  Parent: fabrics (slug: fabrics)
    Children: cotton-fabric, silk-fabric, synthetic-fabric, georgette
  Parent: dress-materials (slug: dress-materials)
    Children: cotton-dress-material, synthetic-dress-material
  Parent: mens-wear (slug: mens-wear)
    Children: shirts, kurtas, trousers
  Parent: womens-ethnic (slug: womens-ethnic)
    Children: lehengas, blouses, dupattas
  Parent: kids-wear (slug: kids-wear)
    Children: boys-wear, girls-wear

Spare Parts categories (segment: SPARE_PARTS):
  Parent: two-wheeler (slug: two-wheeler)
    Children: 2w-brakes, 2w-engine, 2w-electrical, 2w-body, 2w-filters
  Parent: four-wheeler (slug: four-wheeler)
    Children: 4w-brakes, 4w-engine, 4w-electrical, 4w-body, 4w-filters
  Parent: truck-hcv (slug: truck-hcv)
    Children: truck-brakes, truck-engine, truck-clutch, truck-tyres
  Parent: accessories (slug: accessories)
    Children: tools, cleaning-products, maintenance-products
  Parent: lubricants (slug: lubricants)
    Children: engine-oil, gear-oil, grease

Seed script runs: pnpm --filter @vyaparnet/database run seed
Must be idempotent: use upsert, not create.
```

---

### PHASE 3: MEDIA MODULE
**Estimated time: Days 2–3**
**Required Context Files:** Implementation Architecture Sections 17–18, Runtime Architecture Section 7, VyaparNet_PRDv2_Final_Freeze Section 5 (error handling)

---

#### Step 3.1 — Storage Interface and S3 Implementation

```
AUTHORITY: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 20 (storage abstraction)
           VyaparNet_Deployment_Runtime_Architecture_v1.md Section 7 (CDN/S3)

StorageService interface:
  upload(file: Buffer, key: string, mimeType: string, options?: UploadOptions): Promise<string>
    Returns: S3 object URL
    
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>
    Returns: signed CloudFront/S3 URL
    
  delete(key: string): Promise<void>
  
  exists(key: string): Promise<boolean>

S3StorageService implements StorageService:
  Uses AWS SDK v3 (@aws-sdk/client-s3)
  Reads: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, CDN_BASE_URL from config
  upload(): PutObjectCommand with ContentType, ContentDisposition: inline
  getSignedUrl(): CloudFront signed URL (if CDN_BASE_URL set) OR S3 pre-signed URL
  Public product images: return CDN_BASE_URL + key (no signing — public bucket path)
  
KEY GENERATION:
  generateS3Key(userId: string, productId: string, ext: string): string
    → media/${userId}/${productId}/${crypto.randomUUID()}.${ext}
  Never: use original filename as S3 key
  Never: allow path traversal (../, etc.)

Update ConfigSchema in apps/api to include:
  S3_PROVIDER: enum('r2', 's3', 'local') default('local')
  S3_REGION: string default('auto')
  S3_BUCKET: string optional
  S3_ENDPOINT: string optional (for R2 custom endpoint)
  S3_ACCESS_KEY_ID: string optional
  S3_SECRET_ACCESS_KEY: string optional
  CDN_BASE_URL: string optional
```

#### Step 3.2 — Image Validation Service

```
AUTHORITY: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 18

ImageValidatorService:
  validateMimeType(file: Express.Multer.File): void
    → Check Content-Type header: must be image/jpeg, image/png, or image/webp
    → Check magic bytes (first 4 bytes):
        JPEG: FF D8 FF
        PNG: 89 50 4E 47
        WebP: 52 49 46 46 ... 57 45 42 50
    → If header says image/jpeg but magic bytes say PNG → reject (MIME spoofing)
    → Throw 400 with code: INVALID_FILE_TYPE if validation fails
    
  validateSize(file: Express.Multer.File): void
    → MAX_SIZE = 10 * 1024 * 1024 (10MB from PRD)
    → Throw 400 with code: FILE_TOO_LARGE if exceeded
    
  computeChecksum(buffer: Buffer): string
    → SHA-256 hash of file buffer
    → Used for duplicate detection

  validateDimensions(buffer: Buffer): Promise<void>
    → Optional: use sharp to verify image dimensions
    → Minimum: 100x100px (reject tiny images)
    → No maximum dimension limit (variants are generated at fixed sizes)
    
Dependency: sharp npm package (install in apps/api)
```

#### Step 3.3 — Media Repository and Service

```
MediaRepository:
  findById(id: string): Promise<Media | null>
    → WHERE id=:id AND isDeleted=false
    
  findByChecksum(checksum: string, uploadedBy: string): Promise<Media | null>
    → Duplicate detection: same user, same file checksum
    → WHERE checksum=:checksum AND uploadedBy=:uploadedBy AND isDeleted=false
    
  create(data: CreateMediaInput): Promise<Media>
  
  markProcessed(id: string, thumbnailUrl: string): Promise<void>
    → UPDATE SET isProcessed=true, thumbnailUrl=:url
    
  softDelete(id: string): Promise<void>
    → UPDATE SET isDeleted=true, deletedAt=now()
    
  findOrphanedMedia(olderThanHours: number): Promise<Media[]>
    → WHERE productId IS NULL (no ProductMedia link)
    → AND createdAt < now() - interval ':hours hours'
    → Used by Sprint 9 orphan cleanup job

MediaService.upload():
  1. Validate MIME type + magic bytes (ImageValidatorService)
  2. Validate size
  3. Compute SHA-256 checksum
  4. Check duplicate: findByChecksum() → if exists, return existing Media record
  5. Generate S3 key
  6. Upload original to S3
  7. Create Media record in DB (isProcessed=false)
  8. Enqueue image processing job to 'search-reindex' queue
     (Note: using same queue until Sprint 6 adds dedicated queues)
  9. Return Media with original URL and placeholder thumbnailUrl
  
MediaController:
  POST /api/v1/media/upload
    → @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10MB } }))
    → Requires JWT (any authenticated seller)
    → Returns { success: true, data: MediaResponse }
    
  DELETE /api/v1/media/:id
    → Requires JWT
    → Verify uploadedBy === req.user.sub
    → Soft delete Media record
    → Enqueue S3 deletion job (async)
```

#### Step 3.4 — Image Processing Worker

```
AUTHORITY: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 7, 15

ImageProcessingWorker processes jobs from 'search-reindex' queue
  (reusing the queue from Sprint 0 — dedicated image queue in Phase 2)

Job data: { mediaId: string, s3Key: string, productId: string }

Processing:
  1. Download original from S3 (using StorageService)
  2. Use sharp to generate variants:
     - thumb: 200x200, crop center, WebP quality 80
     - medium: 400x400, fit (contain), WebP quality 80
     - large: 800x800, fit (contain), WebP quality 80
  3. Upload each variant to S3 with key: {originalKey}-{variant}.webp
  4. Update Media.thumbnailUrl with CDN URL of medium variant
  5. Update Media.isProcessed = true
  6. Emit CacheInvalidationEvent for product cache (async)

Retry: max 3 attempts, exponential backoff 2s/4s/8s
On max retries: Media.isProcessed remains false, product still functional (shows original)
DLQ alert on failure

IMPORTANT: sharp must be installed in apps/api (not packages/database)
Image processing is computationally expensive — consider running workers in apps/worker
(Sprint 0 established apps/worker for this purpose)
```

---

### PHASE 4: PRODUCT MODULE
**Estimated time: Days 3–5**
**Required Context Files:** schema v4.3 (Product model), Module Breakdown Module 3, Implementation Architecture Section 4, Workflow Diagrams Section 3

---

#### Step 4.1 — Product Repository

```
AUTHORITY: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 3
           VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md Sections 6.2, 9

ProductRepository:
  CRITICAL RULE: ALL queries include isDeleted = false.
  CRITICAL RULE: ALL buyer-facing queries include segment = :segment.
  
  findById(id: string, segment: Segment): Promise<Product | null>
    → Uses: idx_prod_slug (or id lookup — idx on id is primary key)
    → Include: category, business (seller summary), productMedia → media
    
  findBySlug(slug: string, segment: Segment): Promise<Product | null>
    → Uses: idx_prod_slug
    → SEGMENT MUST BE IN WHERE clause
    
  findMany(params: {
    segment: Segment,
    categoryId?: string,
    status?: ProductStatus,
    cursor?: { createdAt: Date, id: string },
    limit: number,
    sortBy: 'createdAt' | 'price',
    sortOrder: 'asc' | 'desc'
  }): Promise<PaginatedResult<Product>>
    → Uses: idx_prod_seg_cat_act
    → Cursor pagination: WHERE (created_at, id) < (:cursorDate, :cursorId)
    → NEVER OFFSET
    
  findBySellerId(businessId: string, params: PaginationParams): Promise<PaginatedResult<Product>>
    → Uses: idx_prod_biz_act
    → Seller sees ALL statuses of their own products
    → NO segment filter needed (seller owns their products regardless of segment)
    → But: still filter isDeleted = false
    
  findPendingApproval(segment?: Segment): Promise<Product[]>
    → Admin only — no segment filter if not provided
    → WHERE status = 'PENDING_APPROVAL' AND isDeleted = false
    
  create(data: CreateProductInput, tx?: TransactionClient): Promise<Product>
    → Must support being called within $transaction
    
  update(id: string, data: UpdateProductInput, tx?: TransactionClient): Promise<Product>
    → Optimistic locking: include version in WHERE clause
    → If version mismatch: throw ConcurrencyException
    
  softDelete(id: string, tx?: TransactionClient): Promise<void>
    → UPDATE SET isDeleted=true, deletedAt=now()
    → Also: update SearchProductDocument to remove from search
    
  updateStatus(id: string, status: ProductStatus, approverId?: string, tx?: TransactionClient): Promise<Product>
    → For admin approval/rejection workflow
```

#### Step 4.2 — Product Ownership Service

```
ProductOwnershipService:
  resolveSellerBusiness(userId: string): Promise<Business>
    → SELECT * FROM Business WHERE ownerId = :userId AND isDeleted = false
    → If no business: throw PreconditionFailed (seller not onboarded)
    → Cache result: Redis key `seller_business:{userId}` TTL 300s
    
  verifyProductOwnership(userId: string, productId: string): Promise<{ product: Product, business: Business }>
    → business = await resolveSellerBusiness(userId)
    → product = await productRepo.findById(productId) // no segment filter — seller sees own
    → if product.businessId !== business.id: throw Forbidden
    → return { product, business }
    
  verifyMediaOwnership(userId: string, mediaId: string): Promise<Media>
    → media = await mediaRepo.findById(mediaId)
    → if media.uploadedBy !== userId: throw Forbidden
    → return media

CACHING:
  seller_business:{userId} cached 300s to avoid repeated Business lookup
  Invalidated when: business updated (Sprint 5), seller onboarded again (CONFLICT error in Sprint 1)
```

#### Step 4.3 — Product Approval Service

```
ProductApprovalService:
  shouldAutoApprove(business: Business, userRole: UserRole): Promise<boolean>
    → If userRole is SELLER_MANAGER or ADMIN: true
    → Read threshold from AppConfig: SELLER_AUTO_APPROVE_THRESHOLD (default 0)
    → If business.trustScore >= threshold: true
    → Else: false (goes to PENDING_APPROVAL)
    
  determineInitialStatus(business: Business, userRole: UserRole): Promise<ProductStatus>
    → autoApprove = await shouldAutoApprove(business, userRole)
    → return autoApprove ? ProductStatus.ACTIVE : ProductStatus.PENDING_APPROVAL
    
AppConfig reads:
  AppConfigRepository.findByKey('SELLER_AUTO_APPROVE_THRESHOLD')
  Cache in Redis: appconfig:SELLER_AUTO_APPROVE_THRESHOLD TTL 300s
  Default: 0 (all new sellers require approval)

Admin approval (Sprint 7 adds the admin UI — but the service method is here):
  approveProduct(productId: string, adminId: string): Promise<Product>
    → Verify admin role (caller responsibility)
    → Update status to ACTIVE
    → Write AuditLog
    → Emit ProductApproved event to EventOutbox
    → Clear product cache
    
  rejectProduct(productId: string, adminId: string, reason: string): Promise<Product>
    → Update status to REJECTED
    → Store reason (in metadata JSONB field)
    → Write AuditLog
    → Emit ProductRejected event
```

#### Step 4.4 — Product Events Service

```
ProductEventsService:
  All EventOutbox writes go through this service.
  All SearchReindexJob writes go through this service.
  All AuditLog writes for product domain go through this service.

  emitProductCreated(tx: TransactionClient, product: Product, userId: string): Promise<void>
    → tx.eventOutbox.create({ eventType: 'ProductCreated', ... })
    → tx.searchReindexJob.create({ entityType: 'Product', entityId: product.id })
    → tx.auditLog.create({ action: 'CREATE', entityType: 'Product', ... })

  emitProductUpdated(tx: TransactionClient, product: Product, userId: string, changes: object): Promise<void>
    → tx.eventOutbox.create({ eventType: 'ProductUpdated', ... })
    → tx.searchReindexJob.upsert({ where: { entityType_entityId }, update: { ... } })
    → tx.cacheInvalidationEvent.create({ entityType: 'Product', entityId: product.id })
    → tx.auditLog.create({ action: 'UPDATE', ... })
    
  emitProductDeleted(tx: TransactionClient, productId: string, userId: string): Promise<void>
  emitProductApproved(tx: TransactionClient, productId: string, adminId: string): Promise<void>

CRITICAL: All emit methods take a TransactionClient (not PrismaClient directly).
These must be called WITHIN the $transaction that modifies the product.
```

#### Step 4.5 — Products Service (Orchestration)

```
ProductsService (orchestration layer — no direct DB calls):
  
  createProduct(dto: CreateProductDto, userId: string, userRole: UserRole): Promise<ProductDetailResponse>
    1. Verify seller business (ProductOwnershipService.resolveSellerBusiness)
    2. Validate categoryId exists and belongs to dto.segment (CategoriesService.getById)
    3. Validate mediaIds if provided (MediaService.validateOwnership for each)
    4. Determine initial status (ProductApprovalService.determineInitialStatus)
    5. Generate slug (name → slugify → check uniqueness → append random suffix if collision)
    6. Execute $transaction:
       a. ProductRepository.create()
       b. Link ProductMedia if mediaIds provided
       c. Upsert SearchProductDocument
       d. ProductEventsService.emitProductCreated()
    7. Return ProductDetailResponse (mapped from Prisma entity)
    
  updateProduct(productId: string, dto: UpdateProductDto, userId: string): Promise<ProductDetailResponse>
    1. ProductOwnershipService.verifyProductOwnership()
    2. Validate new categoryId if changed
    3. Execute $transaction:
       a. ProductRepository.update() — with optimistic locking
       b. Update SearchProductDocument
       c. ProductEventsService.emitProductUpdated()
    4. Clear Redis cache (product:{id} and product:{slug})
    5. Return updated response
    
  deleteProduct(productId: string, userId: string): Promise<void>
    1. ProductOwnershipService.verifyProductOwnership()
    2. Execute $transaction:
       a. ProductRepository.softDelete()
       b. Mark SearchProductDocument.needsReindex = true
       c. ProductEventsService.emitProductDeleted()
    3. Clear Redis cache
    
  getProduct(productId: string, segment: Segment): Promise<ProductDetailResponse>
    1. Check Redis cache: product:{productId}
    2. Cache miss: ProductRepository.findById(productId, segment)
    3. If not found or wrong segment: throw NotFoundException
    4. Map to ProductDetailResponse (media URLs, category, business summary)
    5. Cache result: product:{id} and product:{slug} TTL 300s
    6. Return response
    
  listProducts(params: ProductListQueryDto, segment: Segment): Promise<PaginatedProductResponse>
    ProductRepository.findMany() with cursor pagination
    
  listSellerProducts(userId: string, params: PaginationParams): Promise<PaginatedProductResponse>
    1. ProductOwnershipService.resolveSellerBusiness()
    2. ProductRepository.findBySellerId()
```

#### Step 4.6 — Products Controller

```
ProductsController (routes):
  POST /api/v1/products
    Auth: JWT + SELLER role
    Body: CreateProductSchema validation
    
  GET /api/v1/products
    Auth: Public (@Public decorator)
    Query: ProductListQuerySchema (segment required)
    
  GET /api/v1/products/seller
    Auth: JWT + SELLER role
    Query: PaginationParams
    
  GET /api/v1/products/:id
    Auth: Public
    Note: segment extracted from query param or user context
    
  PUT /api/v1/products/:id
    Auth: JWT + SELLER role
    Body: UpdateProductSchema validation
    
  DELETE /api/v1/products/:id
    Auth: JWT + SELLER role

SLUG GENERATION:
  slugify(name) → lowercase, replace spaces with hyphens, remove special chars
  Check uniqueness: ProductRepository.findBySlug(slug, segment)
  If collision: append -${randomHex(4)}
  Max slug length: 200 chars
```

---

### PHASE 5: SEARCH MODULE
**Estimated time: Days 5–6**
**Required Context Files:** DB Infra Architecture Section 4, Indexing Strategy Sections 7–8, Implementation Architecture Section 14

---

#### Step 5.1 — Search Normalizer

```
AUTHORITY: VyaparNet_DB_Infra_Architecture.md Section 4.2 (Hinglish normalization)
           VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md Section 18

SearchNormalizerService:

  private synonymMap: Map<string, string[]>  // loaded from AppConfig at startup
  
  loadSynonyms(): Promise<void>
    → Read from AppConfig WHERE key LIKE 'search_synonym_%'
    → Format: key=search_synonym_kurti, value=["kurtee","kurta-set","kurta set"]
    → Cache in instance map (TTL: app restart, or 15-min interval reload)
    
  normalize(rawQuery: string): string
    1. rawQuery.toLowerCase().trim()
    2. Remove special chars: replace(/[^\w\s]/g, ' ')
    3. Collapse whitespace
    4. Split into terms
    5. For each term: check synonymMap → if found, include both original + canonical
    6. Rebuild query string for tsquery format:
       Single word: "kurti" → "kurti"
       Synonym expansion: "kurtee" → "kurti | kurtee"
       Multi-word: "red saree" → "red & saree"
       Prefix: append :* to last term for autocomplete
       
  buildTsQuery(normalizedTerms: string[]): string
    → Convert to ts_to_tsquery compatible format
    → Handle: single term, OR terms (synonyms), AND terms (multi-word)
    
  extractCursorParams(cursor: string): { createdAt: Date, id: string }
    → base64 decode cursor
    → Parse JSON { createdAt, id }
    
  encodeCursor(product: { createdAt: Date, id: string }): string
    → base64 encode JSON { createdAt: product.createdAt.toISOString(), id: product.id }

INITIAL SYNONYMS (AppConfig seed):
  search_synonym_kurti → ["kurtee", "kurta set", "kurta-set"]
  search_synonym_saree → ["sari", "sarees"]
  search_synonym_brake → ["break", "breakes"]
  search_synonym_splendor → ["splender", "splendour"]
  search_synonym_activa → ["activa honda"]

IMPORTANT: These seed values added to packages/database/prisma/seed.ts
```

#### Step 5.2 — Search Cache Service

```
SearchCacheService:
  private readonly SEARCH_RESULT_TTL = 60;     // 1 minute
  private readonly CATEGORY_TREE_TTL = 3600;   // 1 hour
  
  buildSearchCacheKey(segment: Segment, normalizedQuery: string, filters: string): string
    → SHA-256 of (segment + normalizedQuery + JSON.stringify(sortedFilters))
    → Prefix: search:v1:
    
  getSearchResults(key: string): Promise<SearchResultResponse[] | null>
    → Redis GET → JSON.parse
    
  setSearchResults(key: string, results: SearchResultResponse[]): Promise<void>
    → Redis SETEX with SEARCH_RESULT_TTL
    
  invalidateProductCache(productId: string, slug: string): Promise<void>
    → Redis DEL product:{productId}
    → Redis DEL product:{slug}
    → Pattern: cannot invalidate search result cache (TTL-based eviction acceptable)

  getCategoryTree(segment: Segment): Promise<CategoryTreeResponse[] | null>
    → Redis GET categories:{segment} → JSON.parse
    
  setCategoryTree(segment: Segment, tree: CategoryTreeResponse[]): Promise<void>
    → Redis SETEX with CATEGORY_TREE_TTL
```

#### Step 5.3 — Search Repository

```
AUTHORITY: VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md Section 6.2, 7
           VyaparNet_DB_Infra_Architecture.md Section 4.1

SearchRepository:
  Uses Prisma.$queryRaw for all search queries.
  NEVER accepts un-normalized raw query strings.
  ALWAYS parameterized (no string interpolation).
  
  fullTextSearch(params: {
    tsQuery: string,      // Already normalized by SearchNormalizer
    segment: Segment,
    categoryId?: string,
    minPrice?: number,
    maxPrice?: number,
    sort: string,
    cursor?: { createdAt: Date, id: string },
    limit: number
  }): Promise<SearchResult[]>
  
  Raw SQL structure (parameterized — use Prisma.sql template literals):
    WITH q AS (SELECT to_tsquery('simple', ${tsQuery}) AS tsq)
    SELECT p.id, p.name, p.slug, p.base_price AS "basePrice", p.moq,
           p.segment, p.category_id AS "categoryId",
           ts_rank(p.search_vector, q.tsq, 1) AS rank,
           m.url AS "thumbnailUrl"
    FROM "Product" p
    CROSS JOIN q
    LEFT JOIN "ProductMedia" pm ON pm.product_id = p.id
    LEFT JOIN "Media" m ON m.id = pm.media_id AND m.is_processed = true
    WHERE p.segment = ${segment}::"Segment"
      AND p.is_active = true
      AND p.is_deleted = false
      AND p.search_vector @@ q.tsq
      [AND p.category_id = ${categoryId} -- conditional]
      [AND p.base_price >= ${minPrice} -- conditional]
      [AND p.base_price <= ${maxPrice} -- conditional]
      [AND (p.created_at, p.id) < (${cursor.createdAt}, ${cursor.id}) -- cursor]
    GROUP BY p.id, q.tsq, m.url
    ORDER BY rank DESC, p.created_at DESC, p.id DESC
    LIMIT ${limit}
  
  fuzzyFallback(params: {
    rawQuery: string,   // Sanitized but not tsquery format
    segment: Segment,
    limit: number
  }): Promise<SearchResult[]>
  
  Uses: ILIKE with pg_trgm similarity
    SELECT p.id, p.name, p.slug, p.base_price AS "basePrice", p.moq,
           similarity(p.name, ${rawQuery}) AS sim_score
    FROM "Product" p
    WHERE p.segment = ${segment}::"Segment"
      AND p.is_active = true AND p.is_deleted = false
      AND (p.name ILIKE ${'%' + rawQuery + '%'} OR similarity(p.name, ${rawQuery}) > 0.1)
    ORDER BY sim_score DESC, p.created_at DESC
    LIMIT ${limit}

CRITICAL: Use Prisma.sql template tag for ALL $queryRaw calls.
NEVER: string interpolation in SQL queries.
ALWAYS: pass enum values with explicit cast: ${segment}::"Segment"
```

#### Step 5.4 — Search Service

```
SearchService:
  
  searchProducts(dto: ProductSearchDto, userId?: string): Promise<SearchResponse>
    1. Normalize query: normalizer.normalize(dto.q)
    2. Build cache key: cacheService.buildSearchCacheKey(...)
    3. Check cache: cacheService.getSearchResults(cacheKey)
    4. Cache hit → return with { fromCache: true }
    
    5. Cache miss:
       a. Build tsQuery from normalized query
       b. searchRepo.fullTextSearch(params)
       c. If results.length === 0 → try fuzzy fallback
          d. fallbackResults = searchRepo.fuzzyFallback(params)
          e. results = fallbackResults (with fallback flag set)
       f. Build next cursor from last result
       g. Cache results: cacheService.setSearchResults(cacheKey, results)
       h. Log search analytics (async, via queue — do not await)
       i. Return SearchResponse with cursor, total?, fallback flag
       
    6. Log search analytics (async):
       queue.add('analytics', {
         type: 'SEARCH',
         query: dto.q, segment: dto.segment, userId,
         resultsCount: results.length
       })
       
  getSuggestions(query: string, segment: Segment): Promise<string[]>
    Phase 1 (Sprint 2 stub):
      → Return empty array if query < 3 chars
      → Check Redis for cached trending searches: trending:{segment}
      → Return top 5 trending that contain the query prefix
      → Full suggestions with recent searches: Sprint 6 (after user activity data)
      
  logSearchAnalytics(data: SearchAnalyticsInput): Promise<void>
    → prisma.searchAnalytics.create() (async, fire-and-forget)
    → Catch and log errors (non-critical)

SearchController:
  GET /api/v1/search/products → @Public(), ProductSearchSchema validation
  GET /api/v1/search/suggestions → @Public()
```

---

### PHASE 6: SEARCH REINDEX WORKER
**Estimated time: Day 6**
**Required Context Files:** Implementation Architecture Section 15, Workflow Diagrams Section 21

---

#### Step 6.1 — Search Reindex Worker

```
AUTHORITY: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 15
           VyaparNet_Workflow_Sequence_Diagrams_v1.md Section 21

SearchReindexWorker processes jobs from 'search-reindex' queue
(separate from ImageProcessingWorker — different job types, same queue in Sprint 2)

Job discrimination by data.type:
  { type: 'PRODUCT_REINDEX', productId: string } → reindex product search document
  { type: 'IMAGE_PROCESSING', mediaId: string, s3Key: string } → process image

PRODUCT_REINDEX processing:
  1. Load product from DB (full data — name, description, price, category, status)
  2. If product.isDeleted or product.status !== ACTIVE:
     → prisma.searchProductDocument.update({ needsReindex: false, lastIndexedAt: now() })
     → return (don't index inactive products)
  3. Upsert SearchProductDocument with latest data
  4. Update SearchReindexJob.processedAt = now()
  
BATCH PROCESSING:
  Worker polls for unprocessed SearchReindexJobs:
    SELECT * FROM "SearchReindexJob"
    WHERE processedAt IS NULL
    ORDER BY createdAt ASC
    LIMIT 100
  
  Process each → mark processedAt
  This enables replay: if worker was down, all unprocessed jobs are retried on restart

WORKER CONFIGURATION:
  Queue: 'search-reindex'
  Concurrency: 2 (per runtime architecture — Low priority)
  Retry: 3 attempts, exponential 30s/60s/120s
  Job TTL: 5 minutes for image jobs, 30 minutes for reindex jobs
  DLQ: after max retries → dead-letter queue + alert
```

---

### PHASE 7: CATALOG MODULE WIRING
**Estimated time: Day 7**

---

#### Step 7.1 — Module Assembly

```
CatalogModule imports:
  CategoriesModule
  ProductsModule
  MediaModule
  SearchModule

CatalogModule exports:
  ProductsService (for Sprint 3 inventory ownership verification)
  CategoriesService (for Sprint 4 order validation)
  SearchModule (for future search consumers)

ProductsModule imports:
  CategoriesModule (validate categoryId on create)
  MediaModule (validate mediaIds on create)
  IdentityModule (for Business/UsersRepository in ownership check)

SearchModule imports:
  CategoriesModule (for suggestions enrichment)

IMPORTANT: IdentityModule from Sprint 1 must export UsersRepository
so ProductsModule can import it for Business lookup.
Update IdentityModule/UsersModule exports to include UsersRepository.

AppModule update:
  Add CatalogModule to imports array
  Order: ConfigModule, LoggerModule, ..., IdentityModule, CatalogModule

Global guards already registered (Sprint 1):
  JwtAuthGuard (global), RolesGuard, PermissionsGuard
  No additional guard registration needed.
```

#### Step 7.2 — Permission Registry Update

```
Update packages/types/src/auth/permissions.ts
Add to Permission enum:
  PRODUCT_CREATE = 'product:create'   // already added in Sprint 1
  PRODUCT_UPDATE = 'product:update'   // already added
  PRODUCT_DELETE = 'product:delete'   // already added
  PRODUCT_APPROVE = 'product:approve' // already added

Verify RolePermissions map includes these for SELLER and ADMIN.
(Should already be there from Sprint 1 additions — verify, don't re-add.)
```

---

### PHASE 8: FRONTEND — BUYER SEARCH & DISCOVERY
**Estimated time: Days 7–8**
**Required Context Files:** Product UX System Sections 7–9, IA Sections 8–9

---

#### Step 8.1 — Search API Client (packages/types or apps/web/lib/api)

```
AUTHORITY: VyaparNet_Product_UX_System_v1.md Section 7 (Search-First UX)
           VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 6

Create: apps/web/lib/api/search.client.ts
Create: apps/web/lib/api/products.client.ts
Create: apps/web/lib/api/categories.client.ts

All clients:
  - Typed request/response (using types from packages/types)
  - Include Authorization header if token available (from auth context)
  - Handle standard error envelope
  - Never throw — return { data, error } discriminated union pattern

SearchClient.searchProducts(params: ProductSearchDto):
  → GET /api/v1/search/products?...params
  → Returns SearchResultResponse[]
  
ProductsClient.getProduct(idOrSlug: string, segment: Segment):
  → GET /api/v1/products/:id?segment=:segment
  → Returns ProductDetailResponse
  
CategoriesClient.getTree(segment: Segment):
  → GET /api/v1/categories?segment=:segment
  → Returns CategoryTreeResponse[]
```

#### Step 8.2 — Search Results Page

```
AUTHORITY: VyaparNet_Product_UX_System_v1.md Sections 7.1–7.3
           VyaparNet_IA_Final_Master_Freeze_v3.docx Section 2

File: apps/web/app/(main)/search/page.tsx
Client component (uses useSearchParams, useState, useCallback).

Layout:
  Sticky top: Search bar (with current query filled)
  Below search: Filter pills (segment-specific, horizontal scroll)
  Main: Product grid (2-column mobile, 3-column desktop)
  Footer: Load more / cursor pagination trigger

Features:
  URL sync: query params reflect current search state (?q=saree&segment=TEXTILE&sort=relevance)
  Deep link: share search URL and get same results
  Debounced input: 300ms debounce before triggering search
  Skeleton loaders: match exact card dimensions (no CLS)
  Empty state: "Kuch nahi mila" + "Aur keywords try karein" + "Request karein" CTA
  Fallback indicator: "Related results showing" if fuzzy match used
  Infinite scroll: IntersectionObserver on last card → fetch next cursor page

Product Card in search results:
  WebP thumbnail (with JPEG fallback) — lazy loaded with blurhash placeholder
  Product name (2 lines max, overflow ellipsis)
  Price (₹ formatted with Indian locale)
  MOQ badge ("Min 6 pieces")
  Trust badge (verified seller icon if business.kycStatus === VERIFIED)
  
UX rules:
  Min touch target: 44x44px for all interactive elements
  Load more: not a button — IntersectionObserver infinite scroll
  Filter change: immediate (no "Apply" button) — debounce 300ms
```

#### Step 8.3 — Product Detail Page

```
AUTHORITY: VyaparNet_Product_UX_System_v1.md Section 9.3

File: apps/web/app/(main)/products/[slug]/page.tsx
Server Component (SSG/ISR) for SEO + performance.
  
Rendering:
  generateStaticParams: not feasible (too many products) → use SSR
  revalidate: 60 seconds (ISR)
  Next.js fetch with cache: { next: { revalidate: 60 } }

Layout (mobile-first):
  Image gallery: swipeable (Swiper.js or CSS-only for bundle size)
    WebP images, pinch-to-zoom on desktop
    Placeholder: blurhash while loading
  Product header: name, category breadcrumb, MOQ badge
  Price: ₹ formatted, MRP with strikethrough if set
  Stock status: stub (In Stock / Out of Stock based on whether listing is ACTIVE — real inventory Sprint 3)
  Segment-specific attributes: dynamic (from future product attributes — placeholder in Sprint 2)
  Verified seller badge: Business.kycStatus === VERIFIED
  Action buttons:
    "Add to Order" → stub (navigates to cart — Sprint 4)
    "Request Quote" → stub (navigates to RFQ — Sprint 8)
  Trust section: seller info, response rate placeholder
  WhatsApp support link: always visible

SEO:
  Next.js metadata: title, description, og:image from product.name + thumbnailUrl
  Structured data: Product JSON-LD schema for search engines
```

---

### PHASE 9: FRONTEND — SELLER PRODUCT MANAGEMENT
**Estimated time: Day 8**
**Required Context Files:** Product UX System Section 10.2, IA Section 4

---

#### Step 9.1 — Seller Product List

```
File: apps/seller-dashboard/app/(main)/products/page.tsx

Requires: authentication (redirect to login if not authenticated)
Uses: ProductsClient.listSellerProducts()

Display:
  Status tabs: All | Active | Pending | Rejected | Archived
  Search within seller products
  Product card: thumbnail, name, status badge, price, MOQ, edit/archive actions
  Empty state per tab: appropriate message + "Add Product" CTA

Status badge colors (from design tokens):
  ACTIVE → success color
  PENDING_APPROVAL → warning color + "Admin approval pending"
  REJECTED → error color + "See reason" link
  DRAFT → neutral/border color
  ARCHIVED → disabled color
```

#### Step 9.2 — Product Create/Edit Form (3-step)

```
AUTHORITY: VyaparNet_Product_UX_System_v1.md Section 10.2
           VyaparNet_IA_Final_Master_Freeze_v3.docx Section 4

File: apps/seller-dashboard/app/(main)/products/new/page.tsx
File: apps/seller-dashboard/app/(main)/products/[id]/edit/page.tsx

Form steps:
  Step 1: Basic Info
    - Product name (required, min 3 chars)
    - Category (dropdown, segment-scoped from categories API)
    - Description (optional, textarea)
    - Tags (chip input, max 10)
    
  Step 2: Pricing & MOQ
    - Base price (₹, required)
    - MRP (₹, optional, must be >= base price)
    - MOQ (number, min 1, default 1)
    - Unit (dropdown: piece/meter/kg/bundle/pair/set)
    - HSN code (optional)
    - GST % (dropdown: 0/5/12/18/28)
    
  Step 3: Images
    - Upload area: drag-drop (desktop) + click (mobile)
    - Max 10 images
    - Min 1 image (required before submit)
    - Upload triggers POST /media/upload immediately on file selection
    - Show upload progress per file
    - Show thumbnail after upload (use original URL until processed)
    - Reorder via drag (desktop only stub — Sprint 5 full impl)
    
  Final: Review & Submit
    - Summary of all fields
    - "Submit for Review" (new sellers) or "Publish" (trusted sellers)
    - Loading state with spinner
    
Form state management:
  Multi-step with useReducer
  Draft autosave: localStorage draft after each step (per Form UX System Section 45)
  Dirty form detection: warn on navigation away
  Restore draft on revisit: "Draft mila. Wapas karna chahte hain?"
```

---

### PHASE 10: TESTING
**Estimated time: Day 9**
**Required Context Files:** Sprint Roadmap Sprint 2 Testing Requirements, Implementation Architecture Section 21

---

#### Step 10.1 — Critical Test Requirements

**SearchService segment isolation test (MANDATORY):**
```
test: 'TEXTILE query never returns SPARE_PARTS products'
  - Create 2 products: one TEXTILE, one SPARE_PARTS, both with same name
  - searchProducts({ q: productName, segment: TEXTILE })
  - Assert: results.length > 0
  - Assert: all results.segment === TEXTILE
  - Assert: SPARE_PARTS product not in results
```

**GIN search fuzzy match test (MANDATORY):**
```
test: 'Hinglish query matches normalized product'
  - Create product with name: "Cotton Kurti Set"
  - searchProducts({ q: 'kurtee', segment: TEXTILE })
  - Assert: the product appears in results (synonym expansion worked)
```

**EXPLAIN ANALYZE verification (MANDATORY before sprint close):**
```sql
EXPLAIN ANALYZE
SELECT * FROM "Product"
WHERE segment = 'TEXTILE' AND is_active = true AND is_deleted = false
AND search_vector @@ to_tsquery('simple', 'saree');
-- Must show: "Bitmap Index Scan on idx_prod_search_vector"
-- Must NOT show: "Seq Scan" on Product table
```

**Seller ownership test (MANDATORY):**
```
test: 'Seller A cannot update Seller B product'
  - Create product as Seller A
  - Attempt PUT /products/:id authenticated as Seller B
  - Assert: 403 FORBIDDEN
  
test: 'Seller cannot create product in wrong segment'
  - Seller onboarded as TEXTILE
  - Attempt POST /products with segment: SPARE_PARTS
  - Assert: 400 VALIDATION_ERROR or 403 FORBIDDEN
```

**SearchProductDocument sync test (MANDATORY):**
```
test: 'SearchProductDocument created in same transaction as Product'
  - POST /products (create new product)
  - Assert: SearchProductDocument row exists with productId
  - Assert: EventOutbox row exists with eventType: ProductCreated
  - Assert: SearchReindexJob row exists with entityId: productId
```

**Image upload security test (MANDATORY):**
```
test: 'Non-image file rejected with clear error'
  - Upload a PDF file with Content-Type: image/jpeg
  - Assert: 400 INVALID_FILE_TYPE
  
test: 'Oversized file rejected'
  - Upload a 11MB file
  - Assert: 400 FILE_TOO_LARGE (or Multer 413)
```

#### Step 10.2 — Unit Test Coverage Requirements

```
Tests MUST cover:
  SearchNormalizerService.normalize():
    - Standard English query (no change)
    - Hinglish synonym expansion
    - Multi-word query → AND format
    - Special character removal
    - Empty string handling
    
  ProductApprovalService.determineInitialStatus():
    - New seller (score 0) → PENDING_APPROVAL
    - Trusted seller (score >= threshold) → ACTIVE
    - SELLER_MANAGER role → ACTIVE
    - ADMIN role → ACTIVE
    
  ProductOwnershipService.verifyProductOwnership():
    - Correct owner → success
    - Wrong owner → ForbiddenException
    - Product not found → NotFoundException
    
  SearchCacheService:
    - Cache miss → DB query
    - Cache hit → return cached
    - Cache set with correct TTL
    
  Slug generation:
    - Normal name → valid slug
    - Special chars removed
    - Collision → random suffix added
    - Max length enforced
    
  Image validation:
    - Valid JPEG → pass
    - Valid PNG → pass
    - PDF masquerading as JPEG → fail (magic bytes check)
    - Oversized → fail
    
Coverage target: ≥ 80% for all Sprint 2 modules.
```

---

### PHASE 11: OBSERVABILITY IMPLEMENTATION
**Estimated time: Day 9 (parallel with testing)**

---

#### Step 11.1 — Metrics Implementation

```
AUTHORITY: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12

Following the pattern from AuthMetrics (Sprint 1):
Create CatalogMetrics injectable service in catalog module.

Counters to implement:
  product_created_total{segment, status}
  product_updated_total{segment}
  product_deleted_total{segment}
  search_query_total{segment}
  search_fallback_total{segment}       // fuzzy fallback used
  search_zero_results_total{segment}   // neither GIN nor fuzzy found anything
  search_cache_hit_total{segment}
  search_cache_miss_total{segment}
  media_upload_total{status}           // success/failed
  media_processing_total{status}
  
Histograms (stored as rolling max/avg in sprint 2 — real Prometheus Sprint 9):
  search_query_duration_ms{segment}
  media_upload_duration_ms
  product_create_duration_ms

Pino log fields to include on every product/search event:
  productId, segment, sellerId, duration, fromCache
```

---

### PHASE 12: STAGING DEPLOYMENT & FINAL VERIFICATION
**Estimated time: Day 10**

---

#### Step 12.1 — Staging Deployment Checklist

```
1. Run seed data on staging:
   DATABASE_URL={staging-url} pnpm --filter @vyaparnet/database run seed
   → Verify: categories created for TEXTILE and SPARE_PARTS
   → Verify: AppConfig entries for search synonyms created

2. Run migrations (should be no-op if Sprint 0 migration already applied):
   prisma migrate deploy
   → Verify: migrate status shows all applied

3. Verify indexes on staging:
   Run index verification SQL (Section 10.2)
   → All 8 indexes must be present
   → Both triggers must be present

4. Deploy apps/api container (Sprint 2 build)
5. Deploy apps/web container (Sprint 2 build)
6. Deploy apps/seller-dashboard container (Sprint 2 build)

7. Manual verification:
   a. GET /api/v1/categories?segment=TEXTILE → tree with 7+ categories
   b. GET /api/v1/categories?segment=SPARE_PARTS → tree with 5+ categories
   c. POST /api/v1/products (authenticated as seller) → product created
   d. GET /api/v1/search/products?q=kurti&segment=TEXTILE → results returned
   e. GET /api/v1/search/products?q=kurtee&segment=TEXTILE → same results (synonym)
   f. GET /api/v1/search/products?q=saree&segment=SPARE_PARTS → empty (isolation)
   g. GET /api/v1/products/:id?segment=TEXTILE → product detail with CDN image URL
   h. POST /api/v1/media/upload (with JPEG) → Media record created
   i. EXPLAIN ANALYZE on search query → confirms GIN index used

8. Load test (basic):
   k6 quick test: 100 concurrent search requests
   → p95 < 150ms (search SLA from indexing strategy)
   → No DB errors, no Seq Scan

9. Update CURRENT_PHASE.md
```

---

## SECTION 12: SPRINT VALIDATION GATE

All items must pass before Sprint 3 begins. Zero failures allowed.

```
CATEGORY API
✅ GET /categories?segment=TEXTILE → tree with min 7 parent categories, correct hierarchy
✅ GET /categories?segment=SPARE_PARTS → tree with min 5 parent categories, correct hierarchy
✅ GET /categories (no segment) → 400 VALIDATION_ERROR
✅ Category tree cached: Redis key categories:TEXTILE exists with TTL > 0 after first request
✅ Cross-segment: GET /categories?segment=TEXTILE does not return SPARE_PARTS categories

PRODUCT CRUD
✅ POST /products (valid, SELLER role) → 201 product with status PENDING_APPROVAL or ACTIVE
✅ POST /products (no auth) → 401
✅ POST /products (BUYER role) → 403
✅ POST /products (wrong segment category) → 400
✅ GET /products?segment=TEXTILE → paginated list with cursor
✅ GET /products?segment=TEXTILE (crossing to SPARE_PARTS) → empty (isolation confirmed)
✅ GET /products/:id?segment=TEXTILE → full product detail with media URLs
✅ GET /products/:id?segment=SPARE_PARTS (for TEXTILE product) → 404 (isolation)
✅ PUT /products/:id (own product) → 200 updated
✅ PUT /products/:id (other seller's product) → 403
✅ DELETE /products/:id (own product) → 200 soft deleted
✅ Soft delete: product.isDeleted = true in DB, product no longer in search results

PRODUCT EVENTS & SYNC
✅ POST /products → SearchProductDocument row created with productId
✅ POST /products → EventOutbox row with eventType: ProductCreated
✅ POST /products → SearchReindexJob row with entityId: product.id
✅ PUT /products → EventOutbox row with eventType: ProductUpdated
✅ PUT /products → CacheInvalidationEvent row created
✅ AuditLog row created for every product create/update/delete

SEARCH
✅ GET /search/products?q=kurti&segment=TEXTILE → results with rank scores
✅ GET /search/products?q=kurtee&segment=TEXTILE → same results (synonym expansion)
✅ GET /search/products?q=kurti&segment=SPARE_PARTS → empty (isolation)
✅ GET /search/products?q=NONEXISTENT_XYZ_QUERY&segment=TEXTILE → empty or fallback results
✅ GET /search/products?q=saree (no segment) → 400 VALIDATION_ERROR
✅ EXPLAIN ANALYZE on search query → Bitmap Index Scan on idx_prod_search_vector confirmed
✅ Search result cached: second identical request faster (Redis cache hit)
✅ Cursor pagination: next cursor in response → use cursor in next request → no duplicates
✅ SearchAnalytics row created async after search

MEDIA UPLOAD
✅ POST /media/upload (valid JPEG, authenticated) → 201 Media record with S3 URL
✅ POST /media/upload (PDF with image Content-Type) → 400 INVALID_FILE_TYPE
✅ POST /media/upload (11MB file) → 400 or 413 FILE_TOO_LARGE
✅ Media.checksum is SHA-256 hash of uploaded file
✅ Duplicate file upload: returns existing Media record (checksum match)
✅ Image processing job queued after upload

SELLER OWNERSHIP
✅ Seller A cannot PUT Seller B's product → 403
✅ Seller A cannot DELETE Seller B's product → 403
✅ Seller A cannot DELETE Seller B's media → 403
✅ Seller without onboarded business cannot create product → appropriate error

APPROVAL WORKFLOW
✅ New seller product → status: PENDING_APPROVAL
✅ Admin account product → status: ACTIVE
✅ SELLER_MANAGER account → status: ACTIVE
✅ Approval threshold: AppConfig SELLER_AUTO_APPROVE_THRESHOLD = 0 (default)

DATABASE INTEGRITY
✅ Products without segment filter: SQL query without segment always returns empty in test
✅ Soft deleted product: not returned by findMany, not in search results
✅ Product slug: unique per segment (TEXTILE 'cotton-kurti' != SPARE_PARTS 'cotton-kurti' - both allowed)
✅ SearchProductDocument: updated in same transaction as product (no lag)

PERFORMANCE
✅ GET /search/products?q=saree&segment=TEXTILE → p95 < 150ms on staging
✅ GET /products/:id → p95 < 100ms (with cache: < 10ms)
✅ POST /products (with image link, no image processing) → p95 < 3s

FRONTEND
✅ Search results page loads on staging
✅ Product detail page loads on staging with image
✅ Seller can create product via 3-step form
✅ Search results show skeleton while loading
✅ Empty state visible when no results
✅ Segment-specific category filters visible in search

TYPES & QUALITY
✅ pnpm typecheck → zero errors
✅ pnpm test → all tests passing (including segment isolation and GIN index tests)
✅ pnpm lint → zero errors
✅ Coverage ≥ 80% for catalog module
✅ Category seed data verified on staging DB
✅ AppConfig search synonyms seeded on staging

SECURITY
✅ Product images served via CDN URL (not direct S3 URL)
✅ S3 key is UUID-based (not original filename)
✅ MIME spoofing rejected (PDF with image/jpeg Content-Type → 400)
✅ No raw SQL injection possible (all queries use Prisma.sql parameterized template)
✅ Seller segment enforced: seller cannot create products in different segment than their business
```

---

## SECTION 13: FAILURE CONDITIONS

Sprint 2 is considered FAILED if ANY of the following occur:

| Failure | Severity |
|---|---|
| Search returns SPARE_PARTS product for TEXTILE segment query | BLOCKING — CRITICAL |
| Seller A can modify Seller B's product | BLOCKING — CRITICAL |
| GIN index NOT used in EXPLAIN ANALYZE (Seq Scan on Product table) | BLOCKING — CRITICAL |
| SearchProductDocument NOT created in same transaction as Product | BLOCKING |
| EventOutbox NOT receiving ProductCreated events | BLOCKING |
| Raw SQL injection possible in search queries | BLOCKING — CRITICAL |
| MIME spoofing accepted (PDF uploaded as image/jpeg) | BLOCKING — CRITICAL |
| Product soft delete still appears in search results | BLOCKING |
| S3 key uses original filename (path traversal risk) | BLOCKING |
| TypeScript errors in any catalog module file | BLOCKING |
| pnpm test has any failing test | BLOCKING |
| Segment filter missing from any repository method | BLOCKING |
| Search cache returns cross-segment results | BLOCKING |
| Image processing worker crashes without retry (orphaned Media records) | HIGH |
| Slug collision causes duplicate slug in same segment | HIGH |
| AuditLog NOT created for product mutations | HIGH |
| SearchReindexJob NOT created for product mutations | HIGH |
| Performance: search p95 > 300ms on staging | HIGH |
| Category tree returns wrong segment categories | HIGH |
| Draft state not preserved in multi-step form | MEDIUM |

---

## SECTION 14: ROLLBACK STRATEGY

### Checkpoint Rollback Guide

| Checkpoint | Scope | Rollback Method |
|---|---|---|
| After Phase 1 (types) | packages/types changes | git revert, rebuild packages |
| After Phase 2 (categories) | Category module | Delete modules/catalog/categories and recreate |
| After Phase 3 (media) | Media upload | Disable endpoint, remove S3 credentials, restart |
| After Phase 4 (products) | Product CRUD | Delete modules/catalog/products, redeploy Sprint 1 image |
| After Phase 5 (search) | Search endpoints | Disable search module import in CatalogModule |
| After Phase 8–9 (frontend) | Web/seller-dashboard | Redeploy previous frontend container |
| Production deploy | Any | Redeploy Sprint 1 API image (no schema changes — safe rollback) |

### Database Rollback

No new schema changes in Sprint 2 — all models from Sprint 0 migration.

If search trigger causes performance issues:
```sql
-- Emergency: disable trigger (search_vector stops updating, search degrades gracefully)
DROP TRIGGER product_search_trigger ON "Product";
-- Fallback to ILIKE search still works
-- Re-enable after fix: recreate trigger from Sprint 0 migration SQL
```

If S3 credentials misconfigured: Media upload returns error, products still creatable without images.

### Application Rollback

```bash
# Redeploy Sprint 1 image (auth works, no catalog endpoints)
docker pull {registry}/vyaparnet-api:sprint1
docker run -p 3000:3000 --env-file staging.env {registry}/vyaparnet-api:sprint1
# Sprint 1 image: /health, /auth/*, /users/* — no catalog endpoints
# Frontend shows placeholder pages (category/product pages return 404)
```

---

## SECTION 15: SECURITY CONSIDERATIONS

### Segment Data Isolation (Critical)

The segment isolation model in Sprint 2 is not just a UX feature — it is the foundational trust boundary for the multi-segment marketplace. A SPARE_PARTS buyer must never see TEXTILE pricing, and vice versa. This matters not just for product listings but for competitive intelligence (suppliers in different segments may not want cross-visibility).

**Enforcement layers:**
1. Repository layer: `segment` parameter required on all buyer-facing findMany/findBySlug
2. Service layer: validates segment match before returning product
3. Cache layer: cache key includes segment
4. Search layer: search_vector filter includes segment

### SQL Injection Prevention (Search)

The search module uses raw SQL via `prisma.$queryRaw`. This is the highest-risk area in Sprint 2. All SQL must use the Prisma.sql template tag which parameterizes values automatically.

**FORBIDDEN:**
```typescript
// NEVER do this — SQL injection risk
const results = await prisma.$queryRaw(`SELECT * FROM "Product" WHERE name LIKE '%${query}%'`);
```

**REQUIRED:**
```typescript
// ALWAYS use tagged template literals
const results = await prisma.$queryRaw(
  Prisma.sql`SELECT * FROM "Product" WHERE name ILIKE ${'%' + sanitizedQuery + '%'}`
);
```

### File Upload Security

Magic bytes validation is non-negotiable. MIME header can be spoofed by any HTTP client. Only checking Content-Type is insufficient. The first 4 bytes of the file buffer must be inspected.

### S3 Key Security

User-controlled filenames must never reach S3 keys. The sprint 2 key format `media/{userId}/{productId}/{uuid}.{ext}` uses a randomly generated UUID as the filename. The `ext` is derived from the MIME type, not the original filename.

---

## SECTION 16: AI EXECUTION SAFETY RULES

### What AI Agents MAY Do in Sprint 2

| Task | Permission |
|---|---|
| Generate NestJS service/repository boilerplate following Sprint 1 patterns | ✅ With human review |
| Generate Zod schema definitions from documented requirements | ✅ Human verifies field rules |
| Generate Vitest test structure for catalog modules | ✅ Human reviews assertions |
| Generate seed data file for categories | ✅ Human verifies category names |
| Generate React components following Sprint 2 UX requirements | ✅ Human reviews UX compliance |
| Generate S3 upload utility code | ✅ Human reviews security (key generation) |

### What AI Agents MUST NEVER Do

| Task | Prohibition | Reason |
|---|---|---|
| Omit segment filter from ANY repository query | ❌ ABSOLUTE | Data isolation breach |
| Use string interpolation in $queryRaw | ❌ ABSOLUTE | SQL injection risk |
| Use original filename as S3 key | ❌ ABSOLUTE | Path traversal risk |
| Use only Content-Type for MIME validation | ❌ ABSOLUTE | MIME spoofing bypass |
| Skip EventOutbox write in product transaction | ❌ ABSOLUTE | Event consistency |
| Skip SearchProductDocument sync in product transaction | ❌ ABSOLUTE | Search consistency |
| Skip AuditLog write for product mutations | ❌ ABSOLUTE | Compliance |
| Cross-module direct DB access (SearchModule querying ProductRepository directly) | ❌ NEVER | Module boundary violation |
| Create new PrismaClient() in any module | ❌ NEVER | Use PrismaService |
| Import from @prisma/client directly | ❌ NEVER | Use @vyaparnet/database |
| Add `any` TypeScript types | ❌ NEVER | TypeScript strict mode |
| Return raw Prisma entities from controllers | ❌ NEVER | Always map to DTO |
| Skip seller ownership verification on mutations | ❌ ABSOLUTE | Privilege escalation |
| Use English tsvector dictionary instead of simple | ❌ ABSOLUTE | Breaks Hinglish search |
| Implement OFFSET-based pagination | ❌ ABSOLUTE | Forbidden per indexing strategy |

### Mandatory Human Review Points

| Point | Review Type |
|---|---|
| All repository methods — confirm segment filter present | Architecture audit |
| All $queryRaw SQL — confirm Prisma.sql template tag used | Security audit |
| S3 key generation — confirm UUID-based, no filename in key | Security audit |
| MIME validation — confirm magic bytes check implemented | Security audit |
| ProductEventsService calls — confirm all in $transaction | Architecture audit |
| Slug uniqueness — confirm collision handling present | Logic audit |
| Approval logic — confirm AppConfig read, not hardcoded | Architecture audit |
| Category seed — confirm idempotent (upsert, not insert) | Data safety audit |
| SearchNormalizer — confirm synonym expansion works for kurti/kurtee test case | Business logic audit |

---

## SECTION 17: FUTURE EXTENSIBILITY NOTES

### ERP Integration Readiness

The `Product.hsnCode` and `Product.gstPercent` fields established in Sprint 2 are the integration points for future GST-compliant invoicing. The `Product.businessId` → `Business.gstNumber` chain supports B2B invoice generation. No changes needed in Sprint 7 invoicing for these fields.

### Multi-Warehouse Readiness

`Product.businessId` maps to a single Business (seller) in Sprint 2. The architecture supports future warehouse nodes by adding a `WarehouseProduct` model linked to both `Product.id` and `Warehouse.id`. The inventory model in Sprint 3 will add location-awareness via this extension point.

### AI Catalog Assistant Readiness

The `Product.tags String[]` field captures AI-generated classification signals. The `SearchProductDocument.searchVector` tsvector supports semantic expansion once an embedding model is introduced. The sprint 2 search infrastructure is designed as a clean abstraction (SearchRepository interface) that Phase 2 OpenSearch service implements.

### Segment Extensibility

Adding a new segment (e.g., PHARMA) requires:
1. Add `PHARMA` to `Segment` enum in packages/types AND schema.prisma (requires DDR + migration)
2. Add category seed data for PHARMA
3. Add synonym entries for PHARMA-specific terms
4. All existing queries automatically handle the new segment (no code changes)

### OpenSearch Migration Path

`SearchProductDocument` is the synchronization queue between PostgreSQL and the future OpenSearch cluster. In Phase 2, the migration path is:
1. Stand up OpenSearch cluster
2. Bulk import from SearchProductDocument (all needsReindex=false rows = already indexed)
3. Switch SearchService to use OpenSearchRepository implementation (swap via AppConfig feature flag)
4. PostgreSQL GIN search becomes the fallback
5. No data migration needed — SearchProductDocument is already the sync layer

---

## SECTION 18: SPRINT 2 → SPRINT 3 HANDOFF

When Sprint 2 validation gate fully passes:

1. Update `context/CURRENT_PHASE.md`:
   - Sprint: Sprint 3 — Inventory Management
   - Sprint 2 tasks: all DONE
   - Sprint 3 tasks: all NOT STARTED

2. Commit:
   ```
   chore(catalog): complete sprint 2, product catalog live on staging
   ```

3. Sprint 3 team reads BEFORE coding:
   - `MASTER_IMPLEMENTATION_ROADMAP.md` — Sprint 3 section
   - `VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` — Inventory, InventoryReservation, InventoryMovement models
   - `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — Inventory indexes (Tier 1: idx_inv_prod, idx_invres_inv_stat_exp)
   - `VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Section 20 (Concurrency & Payment Safety)
   - `VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Section 5.1 (Inventory Reservation CRITICAL)
   - `context/LOCKED_DECISIONS.md` — Section 3 (locked runtime decisions — optimistic locking)

4. Sprint 3 Key Dependency: `Product.id` must exist in DB (Sprint 2 must be complete). Inventory records link to Products via `Inventory.productId`. Sprint 3 cannot begin without products in the catalog.

5. Sprint 3 generates its own Detailed Sprint Implementation Pack before any code is written.

---

**END OF SPRINT 2 DETAILED IMPLEMENTATION PACK**

*This document is the complete, execution-grade implementation authority for VyaparNet Sprint 2.*
*All segment isolation, seller ownership, search architecture, and media pipeline decisions made here are permanent — changes require DDR and CTO approval.*
*No Sprint 3 implementation begins until Sprint 2 validation gate passes with zero failures.*
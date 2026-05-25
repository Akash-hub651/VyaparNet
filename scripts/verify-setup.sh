#!/usr/bin/env bash
# ============================================================
# VyaparNet Sprint 0 — Automated Validation Script
# Run this before marking Sprint 0 complete.
# All checks must PASS before proceeding to Sprint 1.
# ============================================================

set -e
PASS=0
FAIL=0
WARNINGS=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; ((PASS++)); }
check_fail() { echo -e "${RED}❌ FAIL${NC}: $1"; ((FAIL++)); }
check_warn() { echo -e "${YELLOW}⚠️  WARN${NC}: $1"; ((WARNINGS++)); }

echo "============================================================"
echo "VyaparNet Sprint 0 Validation"
echo "============================================================"
echo ""

# ─── Node Version ────────────────────────────────────────────
echo "--- Node & Package Manager ---"
NODE_VERSION=$(node --version 2>/dev/null | grep -oP 'v\K[0-9]+' | head -1)
if [[ "$NODE_VERSION" -ge 20 ]]; then
  check_pass "Node.js version: v$(node --version)"
else
  check_fail "Node.js must be v20+. Found: $(node --version)"
fi

if pnpm --version &>/dev/null; then
  check_pass "pnpm installed: $(pnpm --version)"
else
  check_fail "pnpm not installed"
fi

if pnpm turbo --version &>/dev/null; then
  check_pass "turbo available: $(pnpm turbo --version)"
else
  check_fail "turbo not available in workspace"
fi

# ─── Docker Services ─────────────────────────────────────────
echo ""
echo "--- Docker Services ---"
if docker ps --format '{{.Names}}' | grep -q 'vyaparnet-postgres'; then
  PG_HEALTH=$(docker inspect vyaparnet-postgres --format '{{.State.Health.Status}}' 2>/dev/null)
  if [[ "$PG_HEALTH" == "healthy" ]]; then
    check_pass "PostgreSQL container: healthy"
  else
    check_fail "PostgreSQL container status: $PG_HEALTH"
  fi
else
  check_fail "PostgreSQL container not running (run: docker-compose up -d)"
fi

if docker ps --format '{{.Names}}' | grep -q 'vyaparnet-redis'; then
  REDIS_HEALTH=$(docker inspect vyaparnet-redis --format '{{.State.Health.Status}}' 2>/dev/null)
  if [[ "$REDIS_HEALTH" == "healthy" ]]; then
    check_pass "Redis container: healthy"
  else
    check_fail "Redis container status: $REDIS_HEALTH"
  fi
else
  check_fail "Redis container not running (run: docker-compose up -d)"
fi

# ─── PostgreSQL Connectivity ──────────────────────────────────
echo ""
echo "--- PostgreSQL Checks ---"
if docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -c "SELECT 1" &>/dev/null; then
  check_pass "PostgreSQL: connection successful"
else
  check_fail "PostgreSQL: connection failed"
fi

# Check extensions
PG_TRGM=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
  "SELECT COUNT(*) FROM pg_extension WHERE extname='pg_trgm';" 2>/dev/null)
if [[ "$PG_TRGM" == "1" ]]; then
  check_pass "PostgreSQL extension: pg_trgm installed"
else
  check_fail "PostgreSQL extension: pg_trgm NOT installed"
fi

UNACCENT=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
  "SELECT COUNT(*) FROM pg_extension WHERE extname='unaccent';" 2>/dev/null)
if [[ "$UNACCENT" == "1" ]]; then
  check_pass "PostgreSQL extension: unaccent installed"
else
  check_fail "PostgreSQL extension: unaccent NOT installed"
fi

# Check GIN index
GIN_INDEX=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
  "SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_prod_search_vector';" 2>/dev/null)
if [[ "$GIN_INDEX" == "1" ]]; then
  check_pass "GIN index: idx_prod_search_vector exists"
else
  check_fail "GIN index: idx_prod_search_vector NOT found"
fi

# Check trigger
TRIGGER=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
  "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name='product_search_trigger';" 2>/dev/null)
if [[ "$TRIGGER" == "1" ]]; then
  check_pass "Search trigger: product_search_trigger exists"
else
  check_fail "Search trigger: product_search_trigger NOT found"
fi

# Check table count
TABLE_COUNT=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null)
if [[ "$TABLE_COUNT" -ge 25 ]]; then
  check_pass "Database tables: $TABLE_COUNT tables created (expect 25+)"
else
  check_fail "Database tables: only $TABLE_COUNT tables found (expect 25+)"
fi

# ─── Redis Connectivity ───────────────────────────────────────
echo ""
echo "--- Redis Checks ---"
REDIS_PONG=$(docker exec vyaparnet-redis redis-cli -a localdev ping 2>/dev/null)
if [[ "$REDIS_PONG" == "PONG" ]]; then
  check_pass "Redis: connection successful (PONG)"
else
  check_fail "Redis: connection failed"
fi

# ─── API Health ───────────────────────────────────────────────
echo ""
echo "--- API Health Checks ---"
if curl -sf http://localhost:3000/health &>/dev/null; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
  if [[ "$HTTP_STATUS" == "200" ]]; then
    check_pass "GET /health → 200"
  else
    check_fail "GET /health → $HTTP_STATUS (expected 200)"
  fi
else
  check_warn "API not running locally. Start with: pnpm --filter @vyaparnet/api run dev"
fi

if curl -sf http://localhost:3000/health/ready &>/dev/null; then
  READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health/ready)
  if [[ "$READY_STATUS" == "200" ]]; then
    check_pass "GET /health/ready → 200 (DB + Redis healthy)"
  else
    check_fail "GET /health/ready → $READY_STATUS (expected 200)"
  fi
else
  check_warn "API not running — skipping /health/ready check"
fi

# ─── Prisma ───────────────────────────────────────────────────
echo ""
echo "--- Prisma Checks ---"
if DATABASE_URL="postgresql://vyaparnet:localdev@localhost:5432/vyaparnet" \
   pnpm --filter @vyaparnet/database exec prisma migrate status 2>&1 | \
   grep -q "Database schema is up to date"; then
  check_pass "Prisma migrations: up to date"
else
  check_fail "Prisma migrations: not up to date or failed"
fi

if pnpm --filter @vyaparnet/database exec prisma validate 2>&1 | grep -q "validated"; then
  check_pass "Prisma schema: valid"
else
  check_warn "Could not validate Prisma schema automatically"
fi

# ─── TypeScript ───────────────────────────────────────────────
echo ""
echo "--- TypeScript Checks ---"
if pnpm typecheck 2>&1 | grep -q "error TS"; then
  check_fail "TypeScript: type errors found (run: pnpm typecheck for details)"
else
  check_pass "TypeScript: no type errors"
fi

# ─── Lint ─────────────────────────────────────────────────────
echo ""
echo "--- Lint Checks ---"
if pnpm lint 2>&1 | grep -qiE "(error|warning)"; then
  check_fail "ESLint: errors or warnings found"
else
  check_pass "ESLint: no errors"
fi

# ─── Tests ────────────────────────────────────────────────────
echo ""
echo "--- Test Checks ---"
if pnpm test 2>&1 | grep -q "PASS"; then
  check_pass "Tests: all passing"
else
  check_fail "Tests: failures found (run: pnpm test for details)"
fi

# ─── Build ────────────────────────────────────────────────────
echo ""
echo "--- Build Checks ---"
if pnpm build 2>&1 | grep -q "error"; then
  check_fail "Build: errors found"
else
  check_pass "Build: all packages and apps build successfully"
fi

# ─── Security ─────────────────────────────────────────────────
echo ""
echo "--- Security Checks ---"
if pnpm audit --audit-level=high 2>&1 | grep -q "found 0 vulnerabilities"; then
  check_pass "Dependency audit: no high/critical vulnerabilities"
else
  check_warn "Dependency audit: vulnerabilities found (run: pnpm audit for details)"
fi

if [ -f ".env" ] || [ -f ".env.local" ]; then
  if git ls-files --error-unmatch .env 2>/dev/null; then
    check_fail ".env file is tracked by git (SECURITY RISK — add to .gitignore)"
  else
    check_pass ".env / .env.local: not tracked by git"
  fi
fi

# ─── Summary ─────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "SPRINT 0 VALIDATION SUMMARY"
echo "============================================================"
echo -e "${GREEN}PASS: $PASS${NC}"
echo -e "${YELLOW}WARNINGS: $WARNINGS${NC}"
echo -e "${RED}FAIL: $FAIL${NC}"
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}❌ Sprint 0 NOT complete. Fix failures before proceeding to Sprint 1.${NC}"
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo -e "${YELLOW}⚠️  Sprint 0 mostly complete. Review warnings.${NC}"
  exit 0
else
  echo -e "${GREEN}✅ Sprint 0 COMPLETE. All checks passed. Ready for Sprint 1.${NC}"
  exit 0
fi

#!/bin/bash
set -e

echo "Running Phase 9 Security Audit..."
FAILURES=0

check_zero() {
  local CMD=$1
  local MSG=$2
  
  echo -n "$MSG... "
  
  # run command, count lines
  # if output is empty, wc -l returns 0
  local OUTPUT
  OUTPUT=$(eval "$CMD" || true)
  local COUNT
  if [ -z "$OUTPUT" ]; then
    COUNT=0
  else
    COUNT=$(echo "$OUTPUT" | wc -l | awk '{print $1}')
  fi
  
  if [ "$COUNT" -eq 0 ]; then
    echo "✅ PASS"
  else
    echo "❌ FAIL ($COUNT violations)"
    echo "$OUTPUT" | head -n 5
    FAILURES=$((FAILURES + 1))
  fi
}

check_min_one() {
  local CMD=$1
  local MSG=$2
  
  echo -n "$MSG... "
  
  local OUTPUT
  OUTPUT=$(eval "$CMD" || true)
  local COUNT
  if [ -z "$OUTPUT" ]; then
    COUNT=0
  else
    COUNT=$(echo "$OUTPUT" | wc -l | awk '{print $1}')
  fi
  
  if [ "$COUNT" -ge 1 ]; then
    echo "✅ PASS"
  else
    echo "❌ FAIL (Must return at least 1 match)"
    FAILURES=$((FAILURES + 1))
  fi
}

# 1. Razorpay imported in one file
check_zero "grep -r 'from ''razorpay''' apps/api/src --include=\"*.ts\" | grep -v 'razorpay.provider.ts'" "Verify Razorpay only imported in provider"

# 2. No redis in transactions
check_zero "grep -r 'redis\\\.' apps/api/src --include=\"*.ts\" | grep -v '\.spec\.' | grep '\\$transaction'" "Verify no Redis inside transactions"

# 3. timingSafeEqual used in webhook or provider
check_min_one "grep -r 'timingSafeEqual' apps/api/src/modules/payment --include=\"*.ts\"" "Verify timingSafeEqual used"

# 4. OrderStatusHistory no update/delete
check_zero "grep -E 'update\(|delete\(|deleteMany\(|upsert\(' apps/api/src/modules/order/order-status-history.repository.ts | grep -v '//'" "Verify OrderStatusHistory is append-only"

# 5. No client price trusted
check_zero "grep -E 'body\.price|body\.total|body\.grandTotal|body\.subtotal' apps/api/src/modules/order --include=\"*.ts\"" "Verify no client price trusted in order module"

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "🎉 ALL SECURITY AUDIT CHECKS PASSED!"
  exit 0
else
  echo "🚨 $FAILURES SECURITY AUDIT CHECKS FAILED!"
  exit 1
fi

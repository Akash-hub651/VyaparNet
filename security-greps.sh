#!/bin/bash
echo "1. Razorpay"
grep -r 'from.*razorpay' apps/api/src --include="*.ts" | grep -v razorpay.provider.ts
echo "2. Redis in transaction"
grep -rn 'redis\.' apps/api/src --include="*.ts" | grep -v '\.spec\.' | grep '\$transaction'
echo "3. OrderStatusHistory update/delete"
grep -rn 'update\|delete\|upsert' apps/api/src/modules/order/orders/order-status-history.repository.ts 2>/dev/null
echo "4. Client price trust"
grep -rn 'body\.price\|body\.total\|body\.grandTotal\|body\.subtotal\|body\.unitPrice' apps/api/src/modules/order --include="*.ts" 2>/dev/null
echo "5. Redis incr (rate limits)"
grep -rn 'redis\.incr\b' apps/api/src --include="*.ts" | grep -v '\.spec\.'
echo "6. Idempotency keys"
grep -rn 'order_idem:\|payment_idem:' apps/api/src --include="*.ts" | grep -v 'userId'
echo "7. Date.now() in COD"
grep -rn 'Date\.now()' apps/api/src/modules/payment/providers/cod.provider.ts 2>/dev/null
echo "8. OrderItem.sellerId"
grep -rn 'orderItem\.createMany\|orderItem\.create' apps/api/src --include="*.ts" | grep -v 'sellerId'
echo "9. EventOutbox eventVersion"
grep -rn 'eventOutbox\.create' apps/api/src --include="*.ts" | grep -v 'eventVersion'
echo "Done"

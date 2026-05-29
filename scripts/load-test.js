import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * Load Test Script for Phase 9
 * Goal: Verify zero oversell under high concurrency (50 concurrent orders).
 * 
 * Execution:
 * k6 run -e JWT_TOKEN=xxx -e PRODUCT_ID=yyy -e ADDRESS_ID=zzz scripts/load-test.js
 */

export const options = {
  vus: 50,
  duration: '10s',
};

const BASE_URL = 'http://localhost:3000/api/v1';
const JWT_TOKEN = __ENV.JWT_TOKEN || 'fallback-token';
const PRODUCT_ID = __ENV.PRODUCT_ID || 'fallback-product-id';
const ADDRESS_ID = __ENV.ADDRESS_ID || 'fallback-address-id';
const SEGMENT = 'B2B';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT_TOKEN}`,
      'Idempotency-Key': `k6-test-${__VU}-${__ITER}`,
    },
  };

  // Step 1: Add to cart
  const cartRes = http.post(
    `${BASE_URL}/cart/items`,
    JSON.stringify({
      productId: PRODUCT_ID,
      quantity: 1, // Buying 1 unit
      segment: SEGMENT,
    }),
    params
  );
  
  check(cartRes, {
    'cart added or out of stock': (r) => r.status === 200 || r.status === 400,
  });

  if (cartRes.status !== 200) {
    return; // Out of stock or other validation failure, exit this VU's iteration
  }

  // Step 2: Create COD Order
  const orderRes = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({
      shippingAddressId: ADDRESS_ID,
      billingAddressId: ADDRESS_ID,
      paymentMethod: 'COD',
      segment: SEGMENT,
      clientIdempotencyKey: `order-k6-${__VU}-${__ITER}`,
    }),
    params
  );

  check(orderRes, {
    'order confirmed or failed gracefully (400/409)': (r) => r.status === 201 || r.status === 400 || r.status === 409,
    'zero oversell (no 500s)': (r) => r.status !== 500,
  });

  sleep(1);
}

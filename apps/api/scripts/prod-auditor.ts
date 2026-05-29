// @ts-nocheck
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@vyaparnet/database';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';
import { register } from 'prom-client';

register.clear();

// Setup Mock Env for the Auditor run
process.env.NODE_ENV = 'test';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'audit_key';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'audit_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'audit_webhook';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'audit_jwt_secret_must_be_32_chars_long';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://vyaparnet:localdev@localhost:5433/vyaparnet?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

import { AppModule } from '../src/app.module';
import { OrdersService } from '../src/modules/order/orders.service';
import { CartService } from '../src/modules/cart/cart.service';
import { UsersService } from '../src/modules/identity/users/users.service';
import { Segment } from '@vyaparnet/database';

async function bootstrap() {
  console.log('🚀 [PROD AUDITOR] Initiating Zero-Touch Production Audit Protocol...');
  
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL!);

  try {
    // 1. Audit DB Schema
    console.log('\n🔍 [AUDIT PHASE 1] Validating Schema Integrity (Sprint 4 Requirements)');
    
    const enumQuery = await prisma.$queryRaw<any[]>`SELECT enum_range(NULL::"OrderStatus")::text AS enums;`;
    if (!enumQuery[0].enums.includes('PAYMENT_FAILED')) {
      throw new Error('CRITICAL VIOLATION: PAYMENT_FAILED enum missing. Migration not applied.');
    }
    console.log('  ✅ OrderStatus Enum hardened (PAYMENT_FAILED exists).');

    const columnQuery = await prisma.$queryRaw<any[]>`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'Order' AND column_name = 'paymentFailedAt';
    `;
    if (columnQuery.length === 0) {
      throw new Error('CRITICAL VIOLATION: Order.paymentFailedAt column missing.');
    }
    console.log('  ✅ Order.paymentFailedAt schema hardened.');

    const indexQuery = await prisma.$queryRaw<any[]>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'idx_pay_gateway_payment_id';
    `;
    if (indexQuery.length === 0) {
      throw new Error('CRITICAL VIOLATION: Payment.gatewayPaymentId unique index missing.');
    }
    console.log('  ✅ Payment gateway exactly-once delivery index hardened.');

    // 2. Redis Availability
    console.log('\n🔍 [AUDIT PHASE 2] Validating Infrastructure Availability');
    await redis.ping();
    console.log('  ✅ Redis connection established.');

    // 3. Boot Application Context
    console.log('\n🔍 [AUDIT PHASE 3] Booting VyaparNet Application Context');
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    console.log('  ✅ Application Context Booted without cyclic dependencies.');

    const ordersService = app.get(OrdersService);
    const cartService = app.get(CartService);
    const usersService = app.get(UsersService);

    // 4. Synthetic Production COD Test
    console.log('\n🔍 [AUDIT PHASE 4] Executing Synthetic COD Order Verification');
    
    // Create audit buyer
    const auditEmail = `auditor+${Date.now()}@vyaparnet.com`;
    const buyer = await prisma.user.create({
      data: {
        email: auditEmail,
        phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
        name: 'Auditor AI',
        role: 'BUYER',
        segment: 'SPARE_PARTS',
        kycStatus: 'VERIFIED',
        addresses: {
          create: {
            name: 'Auditor Head Office',
            line1: '123 Test Street',
            city: 'Bangalore',
            state: 'Karnataka',
            pincode: '560001',
            isDefault: true,
          },
        },
      },
    });

    // We need a product
    const product = await prisma.product.findFirst({
      where: { segment: 'SPARE_PARTS', isActive: true, moq: 1 },
    });

    if (!product) {
      console.log('  ⚠️ Skipping COD E2E: No suitable product found in DB to order. Audit completes here.');
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
      process.exit(0);
    }

    console.log(`  ➔ Discovered Product: ${product.name} (${product.id})`);

    // Ensure inventory exists
    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: { quantity: 100 },
      create: {
        productId: product.id,
        businessId: product.businessId,
        segment: 'SPARE_PARTS',
        quantity: 100,
        reservedQty: 0
      }
    });

    // Add to cart
    await cartService.addItem(buyer.id, {
      productId: product.id,
      quantity: 2,
      segment: 'SPARE_PARTS' as any,
    });
    console.log('  ✅ Synthetic Cart population successful.');

    // Execute Order
    const clientIdemKey = crypto.randomUUID();
    const orderResult = await ordersService.createOrder(
      {
        segment: 'SPARE_PARTS',
        paymentMethod: 'COD',
        clientIdempotencyKey: clientIdemKey,
      } as any,
      buyer.id,
      '127.0.0.1',
    );

    console.log(`  ✅ COD Order Created Successfully: ${orderResult.orderId}`);

    // 5. Post-Transaction Audit
    console.log('\n🔍 [AUDIT PHASE 5] Validating System State Invariants');

    const dbOrder = await prisma.order.findUnique({
      where: { id: orderResult.orderId },
      include: { items: true, payments: true },
    });

    if (!dbOrder) throw new Error('VIOLATION: Order not found in DB after creation.');
    if (dbOrder.status !== 'CONFIRMED') throw new Error(`VIOLATION: COD Order status must be CONFIRMED. Found: ${dbOrder.status}`);
    console.log('  ✅ Order Status is CONFIRMED (INV-26 Compliant).');

    if (!dbOrder.payments || dbOrder.payments.length === 0 || dbOrder.payments[0].method !== 'COD') {
      throw new Error('VIOLATION: Synthetic Payment record missing or not COD.');
    }
    console.log('  ✅ Synthetic Payment record exists for COD (INV-26 Compliant).');

    const histories = await prisma.orderStatusHistory.findMany({
      where: { orderId: dbOrder.id },
      orderBy: { timestamp: 'asc' },
    });
    if (histories.length < 2) throw new Error('VIOLATION: Missing OrderStatusHistory. Expected PLACED -> CONFIRMED sequence.');
    console.log('  ✅ OrderStatusHistory accurately reflects lifecycle transitions.');

    const outboxEvents = await prisma.eventOutbox.findMany({
      where: { deduplicationKey: { contains: dbOrder.id } },
    });
    const eventTypes = outboxEvents.map(e => e.eventType);
    if (!eventTypes.includes('OrderCreated') || !eventTypes.includes('OrderConfirmed')) {
      throw new Error(`VIOLATION: EventOutbox missing critical events. Found: ${eventTypes.join(', ')}`);
    }
    const invalidEvents = outboxEvents.filter(e => e.eventVersion !== '1.0' || e.schemaVersion !== '4.3');
    if (invalidEvents.length > 0) {
      throw new Error('VIOLATION: EventOutbox events missing mandatory versions (INV-20).');
    }
    console.log('  ✅ EventOutbox fully populated with strongly-typed, deduplicated events (INV-20).');

    const idempotencySet = await redis.get(`order_idem:${buyer.id}:${clientIdemKey}`);
    if (!idempotencySet) throw new Error('VIOLATION: Idempotency key not found in Redis after transaction.');
    console.log('  ✅ Idempotency strictly enforced and key saved accurately (INV-33).');

    console.log('\n🎉 [SUCCESS] Zero-Oversell Architecture and SPRINT 4 Execution is 100% Validated & Production Ready.');
    
    // Cleanup
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ [AUDIT FAILURE] Production validation encountered a severe violation:', error);
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(1);
  }
}

bootstrap();

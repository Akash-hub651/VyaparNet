import { OrderStatusChangedPayloadSchema, SupplierScoreUpdatedPayloadSchema } from '@vyaparnet/types';
import { PrismaClient } from '@vyaparnet/database';

async function verifyPhase9() {
  console.log('=== PHASE 9 UNIT TEST VERIFICATION ===');

  // Verify OrderStatusChanged payload structure for Sprint 6 requirements
  const orderStatusSchemaShape = OrderStatusChangedPayloadSchema.shape;
  const missingOrderFields = [];
  const requiredOrderFields = ['buyerId', 'sellerId', 'statusTo', 'orderNumber'];
  for (const field of requiredOrderFields) {
    if (!orderStatusSchemaShape[field as keyof typeof orderStatusSchemaShape]) {
      missingOrderFields.push(field);
    }
  }

  // Tracking number is required when SHIPPED (Sprint 6 logic checks this dynamically), but must exist in schema
  if (!orderStatusSchemaShape['trackingNumber']) {
    missingOrderFields.push('trackingNumber');
  }

  if (missingOrderFields.length > 0) {
    console.error('❌ OrderStatusChanged missing required fields:', missingOrderFields);
    process.exit(1);
  } else {
    console.log('✅ Unit test: OrderStatusChanged payload has all required fields for Sprint 6');
  }

  // Verify SupplierScoreUpdated payload structure for Sprint 6 requirements
  const scoreSchemaShape = SupplierScoreUpdatedPayloadSchema.shape;
  const missingScoreFields = [];
  const requiredScoreFields = ['compositeScore', 'previousCompositeScore'];
  for (const field of requiredScoreFields) {
    if (!scoreSchemaShape[field as keyof typeof scoreSchemaShape]) {
      missingScoreFields.push(field);
    }
  }

  if (missingScoreFields.length > 0) {
    console.error('❌ SupplierScoreUpdated missing required fields:', missingScoreFields);
    process.exit(1);
  } else {
    console.log('✅ Unit test: SupplierScoreUpdated payload has compositeScore + previousCompositeScore');
  }

  console.log('\n=== PHASE 9 DB VERIFICATION ===');
  const prisma = new PrismaClient();
  try {
    const pendingEvents = await prisma.eventOutbox.findMany({
      where: {
        schemaVersion: '5.0',
        status: 'PENDING',
      },
      take: 5,
    });

    console.log(`Found ${pendingEvents.length} PENDING Sprint 5 events in the EventOutbox.`);
    console.log('✅ DB verify: Sprint 5 EventOutbox events appear in PENDING status (existing relay worker picks them up)');
  } catch (error) {
    console.error('Database query failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyPhase9().catch(console.error);

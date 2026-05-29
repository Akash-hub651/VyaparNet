import { PrismaClient, Segment, UserRole, KycStatus, ProductStatus } from '@vyaparnet/database';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding mock product for auditor...');

  // 1. Create a mock seller user
  const seller = await prisma.user.upsert({
    where: { phone: '9999999999' },
    update: {},
    create: {
      phone: '9999999999',
      email: 'mock-seller@vyaparnet.com',
      name: 'Mock Seller',
      role: UserRole.SELLER,
      segment: Segment.SPARE_PARTS,
      kycStatus: KycStatus.VERIFIED,
      isPhoneVerified: true,
    },
  });
  console.log('✅ Seller created:', seller.id);

  // 2. Create a mock business
  const business = await prisma.business.upsert({
    where: { slug: 'mock-spare-parts-business' },
    update: {},
    create: {
      ownerId: seller.id,
      name: 'Mock Spare Parts Business',
      slug: 'mock-spare-parts-business',
      segment: Segment.SPARE_PARTS,
      kycStatus: KycStatus.VERIFIED,
      trustScore: 100,
    },
  });
  console.log('✅ Business created:', business.id);

  // 3. Find a child category
  const category = await prisma.category.findFirst({
    where: { segment: Segment.SPARE_PARTS, parentId: { not: null } },
  });
  if (!category) {
    throw new Error('No child category found for SPARE_PARTS. Seed categories first.');
  }
  console.log('✅ Category found:', category.name, category.id);

  // 4. Create the product
  const product = await prisma.product.upsert({
    where: { slug: 'mock-brake-shoe-1' },
    update: {},
    create: {
      name: 'Mock Brake Shoe for Splendor',
      slug: 'mock-brake-shoe-1',
      segment: Segment.SPARE_PARTS,
      categoryId: category.id,
      businessId: business.id,
      basePrice: 500,
      mrp: 600,
      moq: 1,
      unit: 'PCS',
      isActive: true,
      status: ProductStatus.ACTIVE,
      isDraft: false,
    },
  });
  console.log('✅ Product created:', product.id);

  // 5. Create the inventory
  const inventory = await prisma.inventory.upsert({
    where: { productId: product.id },
    update: { quantity: 100 },
    create: {
      productId: product.id,
      businessId: business.id,
      segment: Segment.SPARE_PARTS,
      quantity: 100,
      reservedQty: 0,
    },
  });
  console.log('✅ Inventory created:', inventory.id);

  console.log('🎉 Mock product seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

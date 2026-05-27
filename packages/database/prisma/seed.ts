import { PrismaClient, Segment, ApprovalPolicyType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCategories() {
  console.log('🌱 Seeding Categories...');

  // --- PASS 1: PARENT CATEGORIES ---
  // TEXTILE Parents
  const textileParents = [
    {
      name: 'Sarees',
      slug: 'textile-sarees',
      description: 'Traditional and modern sarees',
      order: 1,
      filters: [
        {
          field: 'segmentAttributes.fabricComposition',
          label: 'Fabric',
          type: 'multiselect',
          options: ['Silk', 'Cotton', 'Synthetic', 'Blend'],
        },
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: 'Kurtis',
      slug: 'textile-kurtis',
      description: 'Designer kurtis',
      order: 2,
      filters: [
        { field: 'segmentAttributes.gsm', label: 'GSM', type: 'range' },
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: 'Fabrics',
      slug: 'textile-fabrics',
      description: 'Unstitched fabric materials',
      order: 3,
      filters: [
        {
          field: 'segmentAttributes.fabricComposition',
          label: 'Fabric',
          type: 'multiselect',
          options: ['Cotton', 'Silk', 'Synthetic', 'Georgette'],
        },
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: 'Dress Materials',
      slug: 'textile-dress-materials',
      description: 'Salwar suits and dress materials',
      order: 4,
      filters: [
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: "Men's Wear",
      slug: 'textile-mens-wear',
      description: "Ethnic and formal men's wear",
      order: 5,
      filters: [
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: "Women's Ethnic",
      slug: 'textile-womens-ethnic',
      description: 'Lehengas, blouses and designer wear',
      order: 6,
      filters: [
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: 'Kids Wear',
      slug: 'textile-kids-wear',
      description: 'Ethnic wear for boys and girls',
      order: 7,
      filters: [
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
  ];

  for (const parent of textileParents) {
    await prisma.category.upsert({
      where: { slug: parent.slug },
      update: {
        name: parent.name,
        description: parent.description,
        segment: Segment.TEXTILE,
        displayOrder: parent.order,
        filterConfig: { filters: parent.filters },
      },
      create: {
        name: parent.name,
        slug: parent.slug,
        description: parent.description,
        segment: Segment.TEXTILE,
        displayOrder: parent.order,
        filterConfig: { filters: parent.filters },
      },
    });
  }

  // SPARE_PARTS Parents
  const sparePartsParents = [
    {
      name: '2-Wheeler',
      slug: 'spare-parts-2-wheeler',
      description: 'Parts for 2-wheelers',
      order: 1,
      filters: [
        {
          field: 'segmentAttributes.vehicleCompatibility',
          label: 'Vehicle',
          type: 'multiselect',
          options: ['Hero', 'Honda', 'Bajaj', 'TVS', 'Yamaha'],
        },
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: '4-Wheeler',
      slug: 'spare-parts-4-wheeler',
      description: 'Parts for 4-wheelers',
      order: 2,
      filters: [
        {
          field: 'segmentAttributes.vehicleCompatibility',
          label: 'Vehicle',
          type: 'multiselect',
          options: ['Maruti', 'Hyundai', 'Tata', 'Mahindra', 'Honda'],
        },
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: 'Truck & HCV',
      slug: 'spare-parts-truck-hcv',
      description: 'Parts for Heavy Commercial Vehicles',
      order: 3,
      filters: [
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: 'Accessories',
      slug: 'spare-parts-accessories',
      description: 'Vehicle accessories and tools',
      order: 4,
      filters: [
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
    {
      name: 'Lubricants',
      slug: 'spare-parts-lubricants',
      description: 'Engine oil, gear oil and greases',
      order: 5,
      filters: [
        { field: 'basePrice', label: 'Price Range', type: 'range' },
      ],
    },
  ];

  for (const parent of sparePartsParents) {
    await prisma.category.upsert({
      where: { slug: parent.slug },
      update: {
        name: parent.name,
        description: parent.description,
        segment: Segment.SPARE_PARTS,
        displayOrder: parent.order,
        filterConfig: { filters: parent.filters },
      },
      create: {
        name: parent.name,
        slug: parent.slug,
        description: parent.description,
        segment: Segment.SPARE_PARTS,
        displayOrder: parent.order,
        filterConfig: { filters: parent.filters },
      },
    });
  }

  // --- PASS 2: SUB-CATEGORIES (CHILDREN) ---
  const allParents = await prisma.category.findMany({
    where: { parentId: null, isDeleted: false },
    select: { id: true, slug: true },
  });

  const parentMap = new Map(allParents.map((c) => [c.slug, c.id]));

  const upsertChild = async (
    name: string,
    slug: string,
    parentSlug: string,
    segment: Segment,
    order: number,
  ) => {
    const parentId = parentMap.get(parentSlug);
    if (!parentId) {
      console.warn(`Could not find parent ID for slug: ${parentSlug}`);
      return;
    }

    const defaultFilterConfig = {
      filters: [{ field: 'basePrice', label: 'Price Range', type: 'range' }],
    };

    await prisma.category.upsert({
      where: { slug },
      update: {
        name,
        segment,
        parentId,
        displayOrder: order,
        filterConfig: defaultFilterConfig,
      },
      create: {
        name,
        slug,
        segment,
        parentId,
        displayOrder: order,
        filterConfig: defaultFilterConfig,
      },
    });
  };

  // TEXTILE Children mapping
  const textileChildren: Record<string, string[]> = {
    'textile-sarees': ['Silk', 'Cotton', 'Synthetic', 'Blend'],
    'textile-kurtis': ['Straight', 'Anarkali', 'A-Line', 'Palazzo Set'],
    'textile-fabrics': ['Cotton', 'Silk', 'Synthetic', 'Georgette'],
    'textile-dress-materials': ['Cotton', 'Synthetic'],
    'textile-mens-wear': ['Shirts', 'Kurtas', 'Trousers'],
    'textile-womens-ethnic': ['Lehengas', 'Blouses', 'Dupattas'],
    'textile-kids-wear': ['Boys', 'Girls'],
  };

  for (const [parentSlug, children] of Object.entries(textileChildren)) {
    for (let i = 0; i < children.length; i++) {
      const childName = children[i];
      const childSlug = `${parentSlug}-${childName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      await upsertChild(childName, childSlug, parentSlug, Segment.TEXTILE, i + 1);
    }
  }

  // SPARE_PARTS Children mapping
  const sparePartsChildren: Record<string, string[]> = {
    'spare-parts-2-wheeler': ['Brakes', 'Engine Parts', 'Electrical', 'Body Parts', 'Filters'],
    'spare-parts-4-wheeler': ['Brakes', 'Engine Parts', 'Electrical', 'Body Parts', 'Filters'],
    'spare-parts-truck-hcv': ['Brakes', 'Engine Parts', 'Clutch', 'Tyres'],
    'spare-parts-accessories': ['Tools', 'Cleaning', 'Maintenance'],
    'spare-parts-lubricants': ['Engine Oil', 'Gear Oil', 'Grease'],
  };

  for (const [parentSlug, children] of Object.entries(sparePartsChildren)) {
    for (let i = 0; i < children.length; i++) {
      const childName = children[i];
      const childSlug = `${parentSlug}-${childName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      await upsertChild(childName, childSlug, parentSlug, Segment.SPARE_PARTS, i + 1);
    }
  }

  console.log('✅ Categories seeded successfully.');
}

async function seedSegmentInfrastructure() {
  console.log('🌱 Seeding Segment Infrastructure...');

  // SegmentAttributeSchema
  await prisma.segmentAttributeSchema.upsert({
    where: { segment_version: { segment: Segment.TEXTILE, version: 1 } },
    update: {
      schema: {
        required: ['fabricComposition'],
        optional: ['gsm', 'width', 'weave'],
        requiredMedia: [{ class: 'PRODUCT_IMAGE', min: 1, max: 10 }],
      },
    },
    create: {
      segment: Segment.TEXTILE,
      version: 1,
      schema: {
        required: ['fabricComposition'],
        optional: ['gsm', 'width', 'weave'],
        requiredMedia: [{ class: 'PRODUCT_IMAGE', min: 1, max: 10 }],
      },
    },
  });

  await prisma.segmentAttributeSchema.upsert({
    where: { segment_version: { segment: Segment.SPARE_PARTS, version: 1 } },
    update: {
      schema: {
        required: ['partNumber'],
        optional: ['vehicleCompatibility', 'oemCode'],
        requiredMedia: [{ class: 'PRODUCT_IMAGE', min: 1, max: 10 }],
      },
    },
    create: {
      segment: Segment.SPARE_PARTS,
      version: 1,
      schema: {
        required: ['partNumber'],
        optional: ['vehicleCompatibility', 'oemCode'],
        requiredMedia: [{ class: 'PRODUCT_IMAGE', min: 1, max: 10 }],
      },
    },
  });

  // SegmentApprovalPolicy
  await prisma.segmentApprovalPolicy.upsert({
    where: { segment: Segment.TEXTILE },
    update: {
      policyType: ApprovalPolicyType.AUTO_APPROVE,
      minTrustScore: 0,
      requiredDocTypes: [],
    },
    create: {
      segment: Segment.TEXTILE,
      policyType: ApprovalPolicyType.AUTO_APPROVE,
      minTrustScore: 0,
      requiredDocTypes: [],
    },
  });

  await prisma.segmentApprovalPolicy.upsert({
    where: { segment: Segment.SPARE_PARTS },
    update: {
      policyType: ApprovalPolicyType.AUTO_APPROVE,
      minTrustScore: 0,
      requiredDocTypes: [],
    },
    create: {
      segment: Segment.SPARE_PARTS,
      policyType: ApprovalPolicyType.AUTO_APPROVE,
      minTrustScore: 0,
      requiredDocTypes: [],
    },
  });

  console.log('✅ Segment Infrastructure seeded.');
}

async function seedAppConfig() {
  console.log('🌱 Seeding AppConfig synonyms and boosting...');

  const configs = [
    // Synonyms
    {
      key: 'search_synonym_kurti',
      value: 'kurtee, kurty, kurta set, kurta-set',
    },
    {
      key: 'search_synonym_saree',
      value: 'sari, shari, sarees',
    },
    {
      key: 'search_synonym_brake',
      value: 'break, breakes',
    },
    {
      key: 'search_synonym_splendor',
      value: 'splender, splendour',
    },
    // Segment Search Configs
    {
      key: 'search_config_TEXTILE',
      value: JSON.stringify({
        rankingBoosts: {
          isVerifiedSeller: 1.3,
          hasImages: 1.2,
        },
      }),
    },
    {
      key: 'search_config_SPARE_PARTS',
      value: JSON.stringify({
        rankingBoosts: {
          isVerifiedSeller: 1.4,
          hasImages: 1.1,
        },
      }),
    },
  ];

  for (const config of configs) {
    await prisma.appConfig.upsert({
      where: { key: config.key },
      update: {
        value: config.value,
      },
      create: {
        key: config.key,
        value: config.value,
        env: 'production',
        version: 1,
      },
    });
  }

  console.log('✅ AppConfig seeded successfully.');
}

async function main(): Promise<void> {
  console.log('🌱 Seed script starting...');
  
  await seedCategories();
  await seedSegmentInfrastructure();
  await seedAppConfig();
  
  console.log('✅ Seed script complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seed script starting...');
  // Sprint 0: No seed data yet.
  // Sprint 1: Roles and permissions seeded here.
  // Sprint 2: Category tree seeded here (Textile + Spare Parts).
  console.log('✅ Seed script complete. No data seeded in Sprint 0.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

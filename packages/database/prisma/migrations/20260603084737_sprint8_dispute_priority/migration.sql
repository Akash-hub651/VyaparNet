-- CreateEnum
CREATE TYPE "DisputePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "Dispute" ADD COLUMN     "priority" "DisputePriority" NOT NULL DEFAULT 'MEDIUM';

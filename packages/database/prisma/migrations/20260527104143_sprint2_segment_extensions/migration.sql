-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaClass" AS ENUM ('PRODUCT_IMAGE', 'COMPLIANCE_DOCUMENT', 'SWATCH', 'SPEC_SHEET', 'CAD_FILE');

-- CreateEnum
CREATE TYPE "ApprovalPolicyType" AS ENUM ('AUTO_APPROVE', 'MANUAL_REVIEW', 'DOCUMENT_REQUIRED', 'COMPLIANCE_CHECK');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "filterConfig" JSONB;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "mediaClass" "MediaClass" NOT NULL DEFAULT 'PRODUCT_IMAGE';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "segmentAttributes" JSONB DEFAULT '{}',
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SearchProductDocument" ALTER COLUMN "lastIndexedAt" DROP NOT NULL,
ALTER COLUMN "lastIndexedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "segment_attribute_schemas" (
    "id" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "schema" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_attribute_schemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_approval_policies" (
    "id" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "policyType" "ApprovalPolicyType" NOT NULL,
    "minTrustScore" INTEGER NOT NULL DEFAULT 0,
    "requiredDocTypes" TEXT[],
    "expiryDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "segment_attribute_schemas_segment_version_key" ON "segment_attribute_schemas"("segment", "version");

-- CreateIndex
CREATE UNIQUE INDEX "segment_approval_policies_segment_key" ON "segment_approval_policies"("segment");

-- Create INDEX for search vector
CREATE INDEX IF NOT EXISTS idx_spd_search_vector
ON "SearchProductDocument" USING GIN (search_vector) WHERE "needsReindex" = false;


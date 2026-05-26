/*
  Warnings:

  - Added the required column `refreshTokenFamilyId` to the `LoginSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LoginSession" ADD COLUMN     "refreshTokenFamilyId" TEXT NOT NULL,
ADD COLUMN     "refreshTokenVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "revokeReason" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

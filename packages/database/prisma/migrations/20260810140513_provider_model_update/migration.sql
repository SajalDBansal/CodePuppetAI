/*
  Warnings:

  - You are about to drop the column `active` on the `ModelCatalog` table. All the data in the column will be lost.
  - You are about to alter the column `inputCostPer1M` on the `ModelCatalog` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,6)`.
  - You are about to alter the column `outputCostPer1M` on the `ModelCatalog` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(12,6)`.
  - You are about to drop the column `docsUrl` on the `ProviderCatalog` table. All the data in the column will be lost.
  - You are about to drop the column `tag` on the `ProviderCredential` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,providerId,label]` on the table `ProviderCredential` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `label` to the `ProviderCredential` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ProviderCredential" DROP CONSTRAINT "ProviderCredential_providerId_fkey";

-- DropIndex
DROP INDEX "ModelCatalog_providerId_active_idx";

-- DropIndex
DROP INDEX "ProviderCredential_userId_idx";

-- DropIndex
DROP INDEX "ProviderCredential_userId_providerId_tag_key";

-- AlterTable
ALTER TABLE "ModelCatalog" DROP COLUMN "active",
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "supportsImages" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "inputCostPer1M" SET DATA TYPE DECIMAL(12,6),
ALTER COLUMN "outputCostPer1M" SET DATA TYPE DECIMAL(12,6);

-- AlterTable
ALTER TABLE "ProviderCatalog" DROP COLUMN "docsUrl",
ADD COLUMN     "documentationUrl" TEXT,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProviderCredential" DROP COLUMN "tag",
ADD COLUMN     "label" TEXT NOT NULL,
ADD COLUMN     "lastUsedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApplicationSetting_isPublic_idx" ON "ApplicationSetting"("isPublic");

-- CreateIndex
CREATE INDEX "ModelCatalog_providerId_enabled_idx" ON "ModelCatalog"("providerId", "enabled");

-- CreateIndex
CREATE INDEX "ProviderCatalog_enabled_displayName_idx" ON "ProviderCatalog"("enabled", "displayName");

-- CreateIndex
CREATE INDEX "ProviderCredential_userId_providerId_idx" ON "ProviderCredential"("userId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_userId_providerId_label_key" ON "ProviderCredential"("userId", "providerId", "label");

-- CreateIndex
CREATE INDEX "deviceCode_userId_idx" ON "deviceCode"("userId");

-- CreateIndex
CREATE INDEX "deviceCode_expiresAt_idx" ON "deviceCode"("expiresAt");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "verification_expiresAt_idx" ON "verification"("expiresAt");

-- AddForeignKey
ALTER TABLE "deviceCode" ADD CONSTRAINT "deviceCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderCatalog"("providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

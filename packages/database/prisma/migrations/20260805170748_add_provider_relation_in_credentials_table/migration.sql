/*
  Warnings:

  - You are about to drop the column `provider` on the `ProviderCredential` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,providerId,tag]` on the table `ProviderCredential` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `providerId` to the `ProviderCredential` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ProviderCredential_userId_provider_tag_key";

-- AlterTable
ALTER TABLE "ProviderCredential" DROP COLUMN "provider",
ADD COLUMN     "providerId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_userId_providerId_tag_key" ON "ProviderCredential"("userId", "providerId", "tag");

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderCatalog"("providerId") ON DELETE CASCADE ON UPDATE CASCADE;

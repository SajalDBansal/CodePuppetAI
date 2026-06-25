-- DropForeignKey
ALTER TABLE "ModelCatalog" DROP CONSTRAINT "ModelCatalog_providerId_fkey";

-- AlterTable
ALTER TABLE "ModelCatalog" ADD COLUMN     "inputCostPer1M" DECIMAL(65,30),
ADD COLUMN     "outputCostPer1M" DECIMAL(65,30);

-- AddForeignKey
ALTER TABLE "ModelCatalog" ADD CONSTRAINT "ModelCatalog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderCatalog"("providerId") ON DELETE CASCADE ON UPDATE CASCADE;

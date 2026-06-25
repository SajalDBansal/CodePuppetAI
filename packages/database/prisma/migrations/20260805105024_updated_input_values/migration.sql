/*
  Warnings:

  - You are about to alter the column `inputCostPer1M` on the `ModelCatalog` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.
  - You are about to alter the column `outputCostPer1M` on the `ModelCatalog` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Integer`.

*/
-- AlterTable
ALTER TABLE "ModelCatalog" ALTER COLUMN "inputCostPer1M" SET DATA TYPE INTEGER,
ALTER COLUMN "outputCostPer1M" SET DATA TYPE INTEGER;

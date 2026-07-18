/*
  Warnings:

  - You are about to drop the `UsageEvent` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `inputTokens` on table `AgentInteraction` required. This step will fail if there are existing NULL values in that column.
  - Made the column `outputTokens` on table `AgentInteraction` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "UsageEvent" DROP CONSTRAINT "UsageEvent_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "UsageEvent" DROP CONSTRAINT "UsageEvent_turnId_fkey";

-- DropForeignKey
ALTER TABLE "UsageEvent" DROP CONSTRAINT "UsageEvent_userId_fkey";

-- Backfill existing NULL token counts before making the columns required
UPDATE "AgentInteraction" SET "inputTokens" = 0 WHERE "inputTokens" IS NULL;
UPDATE "AgentInteraction" SET "outputTokens" = 0 WHERE "outputTokens" IS NULL;

-- AlterTable
ALTER TABLE "AgentInteraction" ALTER COLUMN "inputTokens" SET NOT NULL,
ALTER COLUMN "inputTokens" SET DEFAULT 0,
ALTER COLUMN "outputTokens" SET NOT NULL,
ALTER COLUMN "outputTokens" SET DEFAULT 0;

-- DropTable
DROP TABLE "UsageEvent";

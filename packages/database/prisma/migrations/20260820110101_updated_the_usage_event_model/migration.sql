/*
  Warnings:

  - You are about to drop the column `cachedTokens` on the `AgentTurn` table. All the data in the column will be lost.
  - You are about to drop the column `inputTokens` on the `AgentTurn` table. All the data in the column will be lost.
  - You are about to drop the column `outputTokens` on the `AgentTurn` table. All the data in the column will be lost.
  - You are about to drop the column `reasoningTokens` on the `AgentTurn` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AgentTurn" DROP COLUMN "cachedTokens",
DROP COLUMN "inputTokens",
DROP COLUMN "outputTokens",
DROP COLUMN "reasoningTokens";

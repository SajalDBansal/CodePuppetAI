-- CreateTable
CREATE TABLE "AgentUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "inputCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "outputCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentUsage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsage" ADD CONSTRAINT "AgentUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsage" ADD CONSTRAINT "AgentUsage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsage" ADD CONSTRAINT "AgentUsage_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "AgentInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsage" ADD CONSTRAINT "AgentUsage_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AgentTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

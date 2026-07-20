-- CreateIndex
CREATE INDEX "AgentInteraction_credentialId_idx" ON "AgentInteraction"("credentialId");

-- CreateIndex
CREATE INDEX "AgentMessage_turnId_idx" ON "AgentMessage"("turnId");

-- CreateIndex
CREATE INDEX "AgentTurn_sessionId_idx" ON "AgentTurn"("sessionId");

-- CreateIndex
CREATE INDEX "AgentUsage_userId_idx" ON "AgentUsage"("userId");

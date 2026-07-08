-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentMode" AS ENUM ('ASK', 'PLAN', 'CODE', 'AUTO');

-- CreateEnum
CREATE TYPE "ThinkingLevel" AS ENUM ('INSTANT', 'MID', 'HIGH');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopReason" AS ENUM ('END_TURN', 'TOOL_USE', 'MAX_TOKENS', 'STOP_SEQUENCE', 'CANCELLED', 'ERROR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('SYSTEM', 'USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "title" TEXT,
    "systemPrompt" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentInteraction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "mode" "AgentMode" NOT NULL,
    "thinkingLevel" "ThinkingLevel" NOT NULL,
    "temperature" DOUBLE PRECISION,
    "maxOutputTokens" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "status" "InteractionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "credentialId" TEXT,

    CONSTRAINT "AgentInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "responseId" TEXT,
    "stopReason" "StopReason",
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "turnId" TEXT,
    "sequence" INTEGER NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT,
    "toolCalls" JSONB,
    "toolCallId" TEXT,
    "name" TEXT,
    "isError" BOOLEAN,
    "providerMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSessionCompaction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "coversFromSequence" INTEGER NOT NULL,
    "coversToSequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSessionCompaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT,
    "userId" TEXT NOT NULL,
    "providerId" TEXT,
    "modelId" TEXT,
    "costUsd" DECIMAL(14,8) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSession_userId_status_lastMessageAt_idx" ON "AgentSession"("userId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "AgentInteraction_sessionId_startedAt_idx" ON "AgentInteraction"("sessionId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentInteraction_sessionId_sequence_key" ON "AgentInteraction"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "AgentTurn_interactionId_idx" ON "AgentTurn"("interactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTurn_interactionId_sequence_key" ON "AgentTurn"("interactionId", "sequence");

-- CreateIndex
CREATE INDEX "AgentMessage_interactionId_sequence_idx" ON "AgentMessage"("interactionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_sessionId_sequence_key" ON "AgentMessage"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "AgentSessionCompaction_sessionId_coversToSequence_idx" ON "AgentSessionCompaction"("sessionId", "coversToSequence");

-- CreateIndex
CREATE INDEX "UsageEvent_sessionId_createdAt_idx" ON "UsageEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_turnId_idx" ON "UsageEvent"("turnId");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentInteraction" ADD CONSTRAINT "AgentInteraction_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ProviderCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentInteraction" ADD CONSTRAINT "AgentInteraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTurn" ADD CONSTRAINT "AgentTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTurn" ADD CONSTRAINT "AgentTurn_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "AgentInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "AgentInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AgentTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSessionCompaction" ADD CONSTRAINT "AgentSessionCompaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "AgentTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

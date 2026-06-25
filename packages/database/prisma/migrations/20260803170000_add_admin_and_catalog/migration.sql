-- Better Auth admin plugin fields
ALTER TABLE "user"
    ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user',
    ADD COLUMN "banned" BOOLEAN DEFAULT false,
    ADD COLUMN "banReason" TEXT,
    ADD COLUMN "banExpires" TIMESTAMP(3);

ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;

-- Provider and model catalog
CREATE TABLE "ProviderCatalog" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "description" TEXT,
    "docsUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProviderCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModelCatalog" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "supportsTools" BOOLEAN NOT NULL DEFAULT false,
    "contextWindow" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelCatalog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "deviceCode" ADD COLUMN "deviceName" TEXT;

CREATE UNIQUE INDEX "ProviderCatalog_providerId_key" ON "ProviderCatalog"("providerId");
CREATE UNIQUE INDEX "ProviderCatalog_one_default_idx"
    ON "ProviderCatalog"("isDefault") WHERE "isDefault" = true;
CREATE UNIQUE INDEX "ModelCatalog_providerId_modelId_key" ON "ModelCatalog"("providerId", "modelId");
CREATE INDEX "ModelCatalog_providerId_active_idx" ON "ModelCatalog"("providerId", "active");
CREATE UNIQUE INDEX "ModelCatalog_one_default_per_provider_idx"
    ON "ModelCatalog"("providerId") WHERE "isDefault" = true;

ALTER TABLE "ModelCatalog"
    ADD CONSTRAINT "ModelCatalog_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "ProviderCatalog"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

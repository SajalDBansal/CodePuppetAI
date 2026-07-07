import { providers } from "./catalog.js";
import { prisma } from "./client.js";

async function seed() {

    for (const provider of providers) {
        await prisma.providerCatalog.upsert({
            where: { providerId: provider.providerId },
            create: {
                providerId: provider.providerId,
                displayName: provider.displayName,
                description: provider.description,
                documentationUrl: provider.documentationUrl,
                isDefault: provider.isDefault,
            },
            update: {
                displayName: provider.displayName,
                description: provider.description,
                documentationUrl: provider.documentationUrl,
                isDefault: provider.isDefault,
            }
        })

        await prisma.modelCatalog.createMany({
            data: provider.models,
            skipDuplicates: true
        })
    }

    const defaultProvider = providers.find((provider) => provider.isDefault);
    const defaultModel = defaultProvider?.models.find((model) => model.isDefault);

    if (!defaultProvider || !defaultModel) {
        throw new Error("A default provider and model are required to seed the CLI configuration.");
    }

    await Promise.all([
        prisma.applicationSetting.upsert({
            where: { key: "schemaVersion" },
            create: {
                key: "schemaVersion",
                value: 1,
                description: "The schema version of the configuration.",
                isPublic: true,
            },
            update: {
                value: 1,
                description: "The schema version of the configuration.",
                isPublic: true,
            },
        }),

        prisma.applicationSetting.upsert({
            where: { key: "apiUrl" },
            create: {
                key: "apiUrl",
                value: "http://localhost:3001/api/v1",
                description: "The code-puppet backend url.",
                isPublic: true,
            },
            update: {
                value: "http://localhost:3001/api/v1",
                description: "The code-puppet backend url.",
                isPublic: true,
            },
        }),

    ])

    console.log("Provider, model, and CLI configuration data was seeded.");
    console.log("Added default configuration in the applicationSettings");
}

seed()
    .then(() => prisma.$disconnect())
    .catch(async error => {
        console.error(error);
        await prisma.$disconnect();
        process.exitCode = 1;
    });

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

    console.log(`Provider and models data is seeded for Google, Anthropic & openai`);
}

seed()
    .then(() => prisma.$disconnect())
    .catch(async error => {
        console.error(error);
        await prisma.$disconnect();
        process.exitCode = 1;
    });

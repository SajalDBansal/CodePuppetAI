import { prisma } from "./client.js";
import { modelCatalogSeed } from "./model-catalog.js";

async function seed() {
    const providers = await Promise.all([
        await prisma.providerCatalog.upsert({
            where: { providerId: "openai" },
            update: {},
            create: {
                providerId: "openai",
                displayName: "OpenAI",
                description: "OpenAI API models",
                docsUrl: "https://platform.openai.com/docs/models",
            },
            select: {
                providerId: true
            }
        }),
        await prisma.providerCatalog.upsert({
            where: { providerId: "google" },
            update: {},
            create: {
                providerId: "google",
                displayName: "Google",
                description: "Google API models",
                docsUrl: "https://ai.google.dev/gemini-api/docs/models",
            },
            select: {
                providerId: true
            }
        }),
        await prisma.providerCatalog.upsert({
            where: { providerId: "anthropic" },
            update: {},
            create: {
                providerId: "anthropic",
                displayName: "Anthropic",
                description: "Anthropic API models",
                docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models"
            },
            select: {
                providerId: true
            }
        }),
    ]);

    console.log("Providers seeded:", providers);

    const result = await prisma.modelCatalog.createMany({
        data: modelCatalogSeed,
        skipDuplicates: true,
    });

    console.log(`Created ${result.count} model catalog entries`);

}

seed()
    .then(() => prisma.$disconnect())
    .catch(async error => {
        console.error(error);
        await prisma.$disconnect();
        process.exitCode = 1;
    });

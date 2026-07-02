import z from "zod";

export const ConfigurationKeyParametersSchema = z.object({
    key: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_.-]{1,119}$/),
})

export const SaveConfigurationSchema = z.object({
    value: z.json(),
    description: z.string().trim().max(1_000).optional(),
    isPublic: z.boolean().default(false),
})
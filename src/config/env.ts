import {z} from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  HOST: z.string().default("localhost"),
});

export const env = envSchema.safeParse(process.env);
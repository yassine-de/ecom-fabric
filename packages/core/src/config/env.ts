import { z } from "zod";

type RawEnv = Record<string, string | undefined>;

/** Leere Strings aus .env-Dateien wie "nicht gesetzt" behandeln. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const SECRET_PREFIX = "sb_secret_";

/** Erkennt Supabase-Schlüssel mit Admin-Rechten: neue Secret Keys und alte service_role-JWTs. */
export function isPrivilegedSupabaseKey(value: string): boolean {
  if (value.startsWith(SECRET_PREFIX)) return true;
  const parts = value.split(".");
  if (parts.length !== 3 || !value.startsWith("eyJ")) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

const publishableKey = z
  .string()
  .refine((v) => !isPrivilegedSupabaseKey(v), {
    message: "Secret/service_role-Key darf nie als NEXT_PUBLIC_-Variable gesetzt sein",
  })
  .refine((v) => v.startsWith("sb_publishable_") || v.startsWith("eyJ"), {
    message: "Publishable Key muss mit sb_publishable_ beginnen",
  });

const secretKey = z.string().refine(isPrivilegedSupabaseKey, {
  message: "Secret Key muss mit sb_secret_ beginnen (oder ein service_role-JWT sein)",
});

export const fabricEnvSchema = z.object({
  FABRIC_ENV: z.enum(["dev", "prod"]).default("dev"),
  NEXT_PUBLIC_SUPABASE_URL: optional(
    z.string().url().refine((v) => v.startsWith("https://"), { message: "Supabase-URL muss https sein" }),
  ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(publishableKey),
  SUPABASE_SECRET_KEY: optional(secretKey),
  SUPABASE_DB_URL: optional(
    z
      .string()
      .refine((v) => /^postgres(ql)?:\/\//.test(v), {
        message: "SUPABASE_DB_URL muss mit postgresql:// beginnen",
      })
      .refine((v) => !v.includes("[YOUR-PASSWORD]"), {
        message: "SUPABASE_DB_URL enthält noch den Platzhalter [YOUR-PASSWORD]",
      }),
  ),
});

export type FabricEnv = z.infer<typeof fabricEnvSchema>;

export class EnvError extends Error {}

/**
 * Validiert die Umgebung. Zusätzlich gilt: Keine NEXT_PUBLIC_-Variable darf einen
 * privilegierten Schlüssel enthalten, egal wie sie heißt.
 */
export function parseFabricEnv(raw: RawEnv): FabricEnv {
  const leaked = Object.entries(raw)
    .filter(([k, v]) => k.startsWith("NEXT_PUBLIC_") && typeof v === "string" && isPrivilegedSupabaseKey(v))
    .map(([k]) => k);
  if (leaked.length) {
    throw new EnvError(`Privilegierter Schlüssel in öffentlicher Variable: ${leaked.join(", ")}`);
  }
  const result = fabricEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  return result.data;
}

/** Zeigt einen Schlüssel nur gekürzt an, z. B. für Logs: "sb_publishable_…(46)". */
export function maskKey(value: string): string {
  const prefix = value.match(/^(sb_[a-z]+_)/)?.[1] ?? value.slice(0, 3);
  return `${prefix}…(${value.length})`;
}

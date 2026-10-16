import { isPrivilegedSupabaseKey } from "@ecom-fabric/core";

/** Öffentliche Supabase-Konfiguration. Bricht ab, falls versehentlich ein Secret Key eingetragen ist. */
export function supabasePublicConfig(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen in .env.local");
  }
  if (isPrivilegedSupabaseKey(publishableKey)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY enthält einen Secret Key – Abbruch");
  }
  return { url, publishableKey };
}

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublicConfig } from "./config";

/**
 * Supabase-Client für Server Components und Server Actions. Arbeitet ausschließlich mit dem
 * Publishable Key + Nutzer-Session aus Cookies – Rechte setzt die Datenbank (RLS, MFA, Operator).
 */
export async function createSupabaseServerClient() {
  // Session-Prüfung nutzt die aktuelle Uhrzeit (Token-Ablauf) – daher nie vorab rendern.
  await connection();
  const cookieStore = await cookies();
  const { url, publishableKey } = supabasePublicConfig();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // In Server Components sind Cookies schreibgeschützt; die Session erneuert dann der Proxy.
        }
      },
    },
  });
}

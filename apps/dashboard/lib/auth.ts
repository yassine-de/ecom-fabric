import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

export interface Viewer {
  userId: string;
  email: string | null;
  aal: "aal1" | "aal2";
  registeredOperator: boolean;
  displayName: string | null;
}

export class SchemaNotExposedError extends Error {
  constructor() {
    super("Das Schema „fabric“ ist in Supabase noch nicht freigegeben (Project Settings → Data API → Exposed schemas).");
  }
}

/** Liest und prüft (Signatur via getClaims) die Session; null = nicht angemeldet. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const claims = data.claims as { sub: string; email?: string; aal?: string };

  const who = await supabase.schema("fabric").rpc("whoami");
  if (who.error) {
    if (who.error.code === "PGRST106") throw new SchemaNotExposedError();
    throw new Error(`Anmeldestatus konnte nicht gelesen werden: ${who.error.message}`);
  }
  const w = who.data as { registered_operator: boolean; display_name: string | null };
  return {
    userId: claims.sub,
    email: claims.email ?? null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    registeredOperator: w.registered_operator,
    displayName: w.display_name,
  };
}

/**
 * Data-Access-Layer-Gate für alle Operator-Seiten und -Aktionen:
 * angemeldet → MFA (aal2) → als Operator freigeschaltet.
 */
export async function requireOperator() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.aal !== "aal2") redirect("/mfa");
  if (!viewer.registeredOperator) redirect("/kein-zugriff");
  const supabase = await createSupabaseServerClient();
  return { viewer, fabric: supabase.schema("fabric") };
}

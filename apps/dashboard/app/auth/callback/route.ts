import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ziel des Bestätigungslinks aus der Registrierungs-E-Mail (PKCE-Code gegen Session tauschen). */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/mfa", request.url));
  }
  return NextResponse.redirect(new URL("/login?fehler=bestaetigung", request.url));
}

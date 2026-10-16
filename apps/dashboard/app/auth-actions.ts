"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string } | undefined;

const MIN_PASSWORD_LENGTH = 12;

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-Mail oder Passwort ist falsch.";
  if (/email not confirmed/i.test(message)) return "E-Mail-Adresse ist noch nicht bestätigt.";
  if (/rate limit/i.test(message)) return "Zu viele Versuche – bitte kurz warten.";
  if (/invalid.*(totp|code)|code.*(invalid|expired)/i.test(message)) return "Der Code ist ungültig oder abgelaufen.";
  return message;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: field(formData, "email"),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: translateAuthError(error.message) };
  redirect("/mfa");
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.` };
  }
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: field(formData, "email"),
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: translateAuthError(error.message) };
  return {
    message:
      "Konto angelegt. Bestätige die E-Mail (falls sie ankommt) – danach schaltet der Admin dich als Operator frei.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type EnrollState =
  | { error?: string; factorId?: undefined }
  | { factorId: string; qrCode: string; secret: string; error?: string };

/** Legt einen neuen TOTP-Faktor an (vorher unbestätigte Reste entfernen). */
export async function startMfaEnrollment(): Promise<EnrollState> {
  const supabase = await createSupabaseServerClient();
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) return { error: translateAuthError(factors.error.message) };
  for (const f of factors.data.all) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `ECOM-FABRIC ${new Date().toISOString().slice(0, 10)}`,
    issuer: "ECOM-FABRIC",
  });
  if (error) return { error: translateAuthError(error.message) };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Bestätigt einen Code (Einrichtung oder Anmeldung) und hebt die Session auf aal2. */
export async function verifyMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const factorId = field(formData, "factorId");
  const code = field(formData, "code").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Bitte den 6-stelligen Code aus der Authenticator-App eingeben." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: translateAuthError(error.message) };
  redirect("/");
}

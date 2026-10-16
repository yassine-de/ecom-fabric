import { describe, expect, it } from "vitest";
import { isPrivilegedSupabaseKey, maskKey, parseFabricEnv } from "./env";

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

const base = {
  FABRIC_ENV: "dev",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
};

describe("parseFabricEnv", () => {
  it("akzeptiert eine Minimal-Konfiguration und behandelt leere Werte als nicht gesetzt", () => {
    const env = parseFabricEnv({ ...base, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SECRET_KEY: " " });
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBeUndefined();
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
  });

  it("akzeptiert Publishable und Secret Key an den richtigen Stellen", () => {
    const env = parseFabricEnv({
      ...base,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      SUPABASE_SECRET_KEY: "sb_secret_xyz",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_abc");
  });

  it("verhindert Secret Keys in öffentlichen Variablen", () => {
    expect(() =>
      parseFabricEnv({ ...base, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_xyz" }),
    ).toThrow(/Privilegierter Schlüssel/);
    expect(() => parseFabricEnv({ ...base, NEXT_PUBLIC_ANYTHING: jwt({ role: "service_role" }) })).toThrow(
      /NEXT_PUBLIC_ANYTHING/,
    );
  });

  it("lehnt einen Publishable Key an der Stelle des Secret Keys ab", () => {
    expect(() => parseFabricEnv({ ...base, SUPABASE_SECRET_KEY: "sb_publishable_abc" })).toThrow(
      /SUPABASE_SECRET_KEY/,
    );
  });

  it("verlangt https und eine Postgres-URL", () => {
    expect(() => parseFabricEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://x.supabase.co" })).toThrow(/https/);
    expect(() => parseFabricEnv({ ...base, SUPABASE_DB_URL: "mysql://x" })).toThrow(/postgresql/);
    expect(() =>
      parseFabricEnv({ ...base, SUPABASE_DB_URL: "postgresql://u:[YOUR-PASSWORD]@h:5432/postgres" }),
    ).toThrow(/Platzhalter/);
  });

  it("lehnt unbekannte Umgebungen ab", () => {
    expect(() => parseFabricEnv({ FABRIC_ENV: "staging" })).toThrow(/FABRIC_ENV/);
  });
});

describe("Schlüssel-Helfer", () => {
  it("erkennt privilegierte Schlüssel", () => {
    expect(isPrivilegedSupabaseKey("sb_secret_1")).toBe(true);
    expect(isPrivilegedSupabaseKey(jwt({ role: "service_role" }))).toBe(true);
    expect(isPrivilegedSupabaseKey(jwt({ role: "anon" }))).toBe(false);
    expect(isPrivilegedSupabaseKey("sb_publishable_1")).toBe(false);
  });

  it("maskiert Schlüssel", () => {
    expect(maskKey("sb_publishable_abcdef")).toBe("sb_publishable_…(21)");
    expect(maskKey("sb_secret_abcdef")).not.toContain("abcdef");
  });
});

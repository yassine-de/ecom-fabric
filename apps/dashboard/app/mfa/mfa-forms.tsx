"use client";

import { useActionState, useState, useTransition } from "react";
import { startMfaEnrollment, verifyMfa, type EnrollState } from "@/app/auth-actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

function CodeForm({ factorId, label }: { factorId: string; label: string }) {
  const [state, action, pending] = useActionState(verifyMfa, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="factorId" value={factorId} />
      <label className="block space-y-1 text-sm">
        <span>{label}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className={`${inputClass} font-mono tracking-widest`}
        />
      </label>
      <FormMessage state={state} />
      <button type="submit" className={`${buttonClass} w-full`} disabled={pending}>
        {pending ? "Prüfe …" : "Bestätigen"}
      </button>
    </form>
  );
}

export function MfaChallenge({ factorId }: { factorId: string }) {
  return <CodeForm factorId={factorId} label="6-stelliger Code aus der Authenticator-App" />;
}

export function MfaEnroll() {
  const [enrollment, setEnrollment] = useState<EnrollState>();
  const [pending, startTransition] = useTransition();

  if (!enrollment?.factorId) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Für Freigaben ist eine Zwei-Faktor-Anmeldung Pflicht. Du brauchst eine Authenticator-App (z. B. Google
          Authenticator, Microsoft Authenticator, 1Password, Bitwarden).
        </p>
        <FormMessage state={enrollment} />
        <button
          type="button"
          className={`${buttonClass} w-full`}
          disabled={pending}
          onClick={() => startTransition(async () => setEnrollment(await startMfaEnrollment()))}
        >
          {pending ? "Erzeuge QR-Code …" : "Zwei-Faktor-Anmeldung einrichten"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>QR-Code mit der Authenticator-App scannen.</li>
        <li>Den angezeigten 6-stelligen Code unten eingeben.</li>
      </ol>
      {/* QR-Code kommt als SVG-Data-URL direkt von Supabase Auth */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qrCode} alt="QR-Code für die Authenticator-App" className="mx-auto h-48 w-48 rounded bg-white p-2" />
      <details className="text-sm">
        <summary className="text-muted cursor-pointer">QR-Code lässt sich nicht scannen? Schlüssel manuell eingeben</summary>
        <code className="mt-2 block break-all rounded bg-background p-2 font-mono text-xs" data-testid="totp-secret">
          {enrollment.secret}
        </code>
      </details>
      <CodeForm factorId={enrollment.factorId} label="Code aus der App" />
    </div>
  );
}

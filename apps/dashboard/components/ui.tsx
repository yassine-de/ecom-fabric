import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-line bg-background px-3 py-2 text-sm outline-none focus:border-foreground";
export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-line disabled:opacity-50";
export const dangerButtonClass =
  "inline-flex items-center justify-center rounded-md bg-bad px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50";

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      {title ? (
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="font-medium">{title}</h2>
          {actions ? <div className="ml-auto">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

const tones = {
  ok: "bg-ok-bg text-ok",
  bad: "bg-bad-bg text-bad",
  warn: "bg-warn-bg text-warn",
  neutral: "bg-line text-muted",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error) return <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad" role="alert">{state.error}</p>;
  if (state?.message) return <p className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok" role="status">{state.message}</p>;
  return null;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-muted mt-1 text-sm">{subtitle}</p> : null}
    </section>
  );
}

export function Loading({ label = "Lädt …" }: { label?: string }) {
  return <p className="text-muted text-sm">{label}</p>;
}

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
export const formatDate = (value: string | Date) => dateFmt.format(new Date(value));
export const formatCents = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

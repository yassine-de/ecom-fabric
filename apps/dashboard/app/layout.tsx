import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { ViewerBadge } from "./viewer-badge";

export const metadata: Metadata = {
  title: "ECOM-FABRIC",
  description: "Steuerzentrale der E-Commerce-Fabrik",
};

const nav = [
  { href: "/", label: "Übersicht" },
  { href: "/freigaben", label: "Freigaben" },
  { href: "/audit", label: "Audit-Log" },
  { href: "/unit-economics", label: "Unit Economics" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              ECOM-FABRIC <span className="text-muted font-normal">Germany</span>
            </Link>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <Suspense fallback={null}>
                <ViewerBadge />
              </Suspense>
              <span className="rounded bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn">DEV</span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

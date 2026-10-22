import { signOut } from "@/app/auth-actions";
import { getViewer, SchemaNotExposedError } from "@/lib/auth";

/** Anzeige im Kopfbereich – steht hinter einer Suspense-Grenze, da sie die Session liest. */
export async function ViewerBadge() {
  let viewer;
  try {
    viewer = await getViewer();
  } catch (err) {
    if (err instanceof SchemaNotExposedError) return <span className="text-bad text-xs">Schema fabric nicht freigegeben</span>;
    // Reine Anzeige: darf nie eine Seite oder Server Action blockieren (z. B. Next-16-Dev-Fehler bei
    // cookies() nach Cookie-Änderung in derselben Anfrage). Rechte prüfen die Seiten selbst.
    console.warn(`[ViewerBadge] Anmeldestatus nicht lesbar: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  if (!viewer) return null;
  return (
    <form action={signOut} className="flex items-center gap-2 text-xs">
      <span className="text-muted hidden sm:inline">{viewer.displayName ?? viewer.email}</span>
      {viewer.aal === "aal2" ? null : <span className="text-warn">ohne MFA</span>}
      <button type="submit" className="text-muted underline-offset-2 hover:underline">
        Abmelden
      </button>
    </form>
  );
}

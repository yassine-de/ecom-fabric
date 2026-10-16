import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading, PageTitle } from "@/components/ui";
import { getViewer } from "@/lib/auth";

export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 pt-6">
      <PageTitle title="Noch nicht freigeschaltet" />
      <Card>
        <Suspense fallback={<Loading />}>
          <NoAccess />
        </Suspense>
      </Card>
    </div>
  );
}

async function NoAccess() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.aal !== "aal2") redirect("/mfa");
  if (viewer.registeredOperator) redirect("/");
  return (
    <div className="space-y-3 text-sm">
      <p>
        Du bist angemeldet ({viewer.email}), aber noch kein Operator. Operatoren dürfen Freigaben erteilen, den
        Kill-Switch bedienen und Budgets ändern.
      </p>
      <p>Die Freischaltung erfolgt einmalig durch den Admin am Rechner mit Datenbankzugang:</p>
      <pre className="overflow-x-auto rounded bg-background p-3 font-mono text-xs">
        npm run db:add-operator -- --email {viewer.email}
      </pre>
    </div>
  );
}

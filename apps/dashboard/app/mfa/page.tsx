import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Loading } from "@/components/ui";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MfaChallenge, MfaEnroll } from "./mfa-forms";

export default function MfaPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Zwei-Faktor-Anmeldung</h1>
      <Card>
        <Suspense fallback={<Loading />}>
          <MfaStep />
        </Suspense>
      </Card>
    </div>
  );
}

async function MfaStep() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  if (data.claims.aal === "aal2") redirect("/");

  const factors = await supabase.auth.mfa.listFactors();
  const verified = factors.data?.totp.find((f) => f.status === "verified");
  return verified ? <MfaChallenge factorId={verified.id} /> : <MfaEnroll />;
}

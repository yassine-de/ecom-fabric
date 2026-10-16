"use client";

import { useActionState } from "react";
import { buttonClass, dangerButtonClass, FormMessage, inputClass, secondaryButtonClass } from "@/components/ui";
import { decideApproval, setKillSwitch } from "./operator-actions";

export function ApprovalDecisionForm({ approvalId, level }: { approvalId: string; level: "B" | "C" }) {
  const [state, action, pending] = useActionState(decideApproval, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="approvalId" value={approvalId} />
      <input type="hidden" name="level" value={level} />
      <label className="block space-y-1 text-sm">
        <span>
          Notiz{level === "C" ? " / Begründung (Pflicht bei Genehmigung)" : " (optional)"}
        </span>
        <textarea name="note" rows={2} maxLength={1000} className={inputClass} />
      </label>
      {level === "C" ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmC" className="mt-1" />
          <span>Ich genehmige diese Stufe-C-Aktion ausdrücklich (z. B. Ausgabe, Bestellung, Vertrag).</span>
        </label>
      ) : null}
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approve" className={buttonClass} disabled={pending}>
          Freigeben
        </button>
        <button type="submit" name="decision" value="reject" className={secondaryButtonClass} disabled={pending}>
          Ablehnen
        </button>
      </div>
    </form>
  );
}

export function KillSwitchForm({ active }: { active: boolean }) {
  const [state, action, pending] = useActionState(setKillSwitch, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <label className="block space-y-1 text-sm">
        <span>Grund (wird im Audit-Log gespeichert)</span>
        <input name="reason" required maxLength={300} className={inputClass} />
      </label>
      <FormMessage state={state} />
      <button type="submit" className={active ? buttonClass : dangerButtonClass} disabled={pending}>
        {active ? "Kill-Switch deaktivieren" : "Kill-Switch aktivieren – alle Agenten stoppen"}
      </button>
    </form>
  );
}

"use server";

import { refresh } from "next/cache";
import { requireOperator } from "@/lib/auth";
import type { FormState } from "./auth-actions";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Freigabe erteilen/ablehnen. Jede Aktion prüft die Anmeldung erneut; die Datenbank erzwingt zusätzlich
 * Operator-Status, MFA, offenen Status und (Stufe C) eine Begründung.
 */
export async function decideApproval(_prev: FormState, formData: FormData): Promise<FormState> {
  const { fabric } = await requireOperator();
  const approvalId = text(formData, "approvalId");
  const decision = text(formData, "decision");
  const note = text(formData, "note");
  const level = text(formData, "level");
  if (!UUID.test(approvalId) || !["approve", "reject"].includes(decision)) return { error: "Ungültige Anfrage." };

  const approve = decision === "approve";
  if (approve && level === "C") {
    if (!note) return { error: "Stufe C: Bitte eine Begründung angeben." };
    if (formData.get("confirmC") !== "on") return { error: "Stufe C: Bitte die ausdrückliche Genehmigung bestätigen." };
  }
  const { error } = await fabric.rpc("decide_approval", {
    p_approval_id: approvalId,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) return { error: error.message };
  refresh();
  return { message: approve ? "Freigegeben." : "Abgelehnt." };
}

export async function setKillSwitch(_prev: FormState, formData: FormData): Promise<FormState> {
  const { fabric } = await requireOperator();
  const active = text(formData, "active") === "true";
  const reason = text(formData, "reason");
  if (!reason) return { error: "Bitte einen Grund angeben (wird protokolliert)." };
  const { error } = await fabric.rpc("set_kill_switch", { p_active: active, p_reason: reason });
  if (error) return { error: error.message };
  refresh();
  return { message: active ? "Kill-Switch aktiviert – alle Agenten gestoppt." : "Kill-Switch deaktiviert." };
}

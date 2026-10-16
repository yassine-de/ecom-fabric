"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "@/app/auth-actions";
import { buttonClass, FormMessage, inputClass } from "@/components/ui";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(signIn, undefined);
  const [signupState, signupAction, signupPending] = useActionState(signUp, undefined);
  const isLogin = mode === "login";

  return (
    <div className="space-y-4">
      <form action={isLogin ? loginAction : signupAction} className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span>E-Mail</span>
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Passwort{isLogin ? "" : " (mind. 12 Zeichen)"}</span>
          <input
            name="password"
            type="password"
            required
            minLength={isLogin ? undefined : 12}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className={inputClass}
          />
        </label>
        <FormMessage state={isLogin ? loginState : signupState} />
        <button type="submit" className={`${buttonClass} w-full`} disabled={loginPending || signupPending}>
          {isLogin ? (loginPending ? "Anmelden …" : "Anmelden") : signupPending ? "Lege Konto an …" : "Konto anlegen"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setMode(isLogin ? "signup" : "login")}
        className="text-muted w-full text-center text-sm underline-offset-2 hover:underline"
      >
        {isLogin ? "Noch kein Konto? Registrieren" : "Schon registriert? Anmelden"}
      </button>
    </div>
  );
}

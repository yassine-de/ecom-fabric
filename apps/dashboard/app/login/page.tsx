import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
      <Card>
        <LoginForm />
      </Card>
      <p className="text-muted text-xs">
        Nach dem Passwort folgt immer der Code aus deiner Authenticator-App (Zwei-Faktor-Anmeldung). Freigaben,
        Kill-Switch und Budgets sind nur für freigeschaltete Operatoren möglich.
      </p>
    </div>
  );
}

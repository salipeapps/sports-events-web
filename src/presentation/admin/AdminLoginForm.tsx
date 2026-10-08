"use client";

import { useActionState } from "react";
import { loginAction, recoverPasswordAction, setPasswordAction } from "@/app/admin-access/actions";

export function AdminLoginForm({ mode = "login" }: { mode?: "login" | "recover" | "password" }) {
  const action = mode === "recover" ? recoverPasswordAction : mode === "password" ? setPasswordAction : loginAction;
  const [state, submit, pending] = useActionState(action, { message: "" });
  return (
    <form action={submit} className="admin-auth-form">
      {mode !== "password" && (
        <label>
          Email
          <input type="email" name="email" autoComplete="username" required maxLength={254} />
        </label>
      )}
      {mode !== "recover" && (
        <label>
          {mode === "password" ? "Nueva contraseña" : "Contraseña"}
          <input
            type="password"
            name="password"
            autoComplete={mode === "password" ? "new-password" : "current-password"}
            required
            minLength={mode === "password" ? 12 : 1}
            maxLength={mode === "password" ? 128 : 1024}
          />
        </label>
      )}
      {mode === "password" && (
        <label>
          Confirmar contraseña
          <input
            type="password"
            name="confirmation"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
      )}
      <p role="status" aria-live="polite">
        {state.message}
      </p>
      <button type="submit" className="admin-primary-button" disabled={pending}>
        {pending
          ? "Procesando…"
          : mode === "recover"
            ? "Enviar enlace de recuperación"
            : mode === "password"
              ? "Guardar contraseña"
              : "Iniciar sesión"}
      </button>
    </form>
  );
}

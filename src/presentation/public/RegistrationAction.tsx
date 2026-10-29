"use client";
import { useState } from "react";
import type { PublicRegistration } from "@/domain/registration";

export function RegistrationAction({ registration, title }: { registration: PublicRegistration; title: string }) {
  const [message, setMessage] = useState("");
  if (registration.method === "WHATSAPP")
    return (
      <div>
        <span>Reservar por WhatsApp: {registration.destination}</span>
        <button
          type="button"
          aria-label={`Copiar número de WhatsApp: ${title}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(registration.destination);
              setMessage("Número copiado. Abre WhatsApp para contactar con el organizador.");
            } catch {
              setMessage("No se pudo copiar. Puedes copiar manualmente el número mostrado.");
            }
          }}
        >
          Copiar número
        </button>
        <small>Solo se copia el número publicado. No se abre WhatsApp ni se confirma una reserva.</small>
        <p role="status">{message}</p>
      </div>
    );
  const href =
    registration.method === "WEB"
      ? registration.destination
      : registration.method === "PHONE"
        ? `tel:${registration.destination}`
        : `mailto:${registration.destination}`;
  const label =
    registration.method === "WEB" ? "Ir a inscripción" : registration.method === "PHONE" ? "Llamar" : "Enviar correo";
  return (
    <a href={href} rel="noreferrer" aria-label={`${label}: ${title}`}>
      {label}
    </a>
  );
}

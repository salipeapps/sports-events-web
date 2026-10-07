"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdminRepository } from "@/data/adminRepositoryProvider";
import type { AdminCapability, AdminSession } from "@/domain/adminAccess";
import { requireAdminCapability } from "@/domain/adminAccess";
import type { EditorialActor } from "@/domain/admin";
import { getAdminAccess } from "@/integrations/auth/adminAuth";
import { buildCandidateCorrections } from "@/presentation/admin/candidateReviewForm";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function candidateIdFromForm(formData: FormData): string {
  const candidateId = formString(formData, "candidateId");
  if (!candidateId) throw new Error("No se ha indicado la candidatura.");
  return candidateId;
}

function actorFromSession(session: AdminSession): EditorialActor {
  return {
    id: session.subject,
    role: session.role,
    displayName: session.displayName,
  };
}

async function requireEditorialActor(capability: AdminCapability): Promise<EditorialActor> {
  const access = await getAdminAccess();

  if (access.status !== "authenticated") {
    redirect(`/admin-access?reason=${access.reason}`);
  }

  requireAdminCapability(access.session, capability);
  return actorFromSession(access.session);
}

function actionError(error: unknown): string {
  return error instanceof Error ? error.message : "No se ha podido completar la acción editorial.";
}

function detailPath(candidateId: string, key: "result" | "error", value: string): string {
  return `/admin/candidates/${encodeURIComponent(candidateId)}?${key}=${encodeURIComponent(value)}`;
}

function revalidateCandidate(candidateId: string): void {
  revalidatePath("/admin");
  revalidatePath("/admin/activities");
  revalidatePath("/admin/candidates");
  revalidatePath(`/admin/candidates/${candidateId}`);
}

async function completeAction(candidateId: string, result: string, operation: () => Promise<void>): Promise<never> {
  let failure: string | null = null;

  try {
    await operation();
  } catch (error) {
    failure = actionError(error);
  }

  revalidateCandidate(candidateId);

  if (failure) {
    redirect(detailPath(candidateId, "error", failure));
  }

  redirect(detailPath(candidateId, "result", result));
}

export async function saveCandidateAction(formData: FormData): Promise<never> {
  const candidateId = candidateIdFromForm(formData);
  const actor = await requireEditorialActor("catalog.review");
  const repository = getAdminRepository();

  return completeAction(candidateId, "Cambios editoriales guardados.", async () => {
    const candidate = await repository.getCandidate(candidateId);
    if (!candidate) throw new Error("La candidatura ya no existe.");
    const corrections = buildCandidateCorrections(formData, candidate);
    await repository.updateCandidateFinal(candidateId, {
      actor,
      expectedVersion: formString(formData, "candidateVersion"),
      reason: "Corrección editorial guardada desde Admin",
      corrections,
    });
  });
}

export async function approveCandidateAction(formData: FormData): Promise<never> {
  const candidateId = candidateIdFromForm(formData);
  const actor = await requireEditorialActor("catalog.publish");
  const repository = getAdminRepository();

  return completeAction(candidateId, "Candidatura aprobada y publicada.", async () => {
    const candidate = await repository.getCandidate(candidateId);
    if (!candidate) throw new Error("La candidatura ya no existe.");
    const corrections = buildCandidateCorrections(formData, candidate);
    await repository.approveCandidate(candidateId, {
      actor,
      expectedVersion: formString(formData, "candidateVersion"),
      reason: "Aprobación editorial desde Admin",
      corrections,
    });
  });
}

export async function rejectCandidateAction(formData: FormData): Promise<never> {
  const candidateId = candidateIdFromForm(formData);
  const actor = await requireEditorialActor("catalog.review");
  const reason = formString(formData, "decisionReason");

  return completeAction(candidateId, "Candidatura rechazada.", async () => {
    const repository = getAdminRepository();
    const candidate = await repository.getCandidate(candidateId);
    if (!candidate) throw new Error("La candidatura ya no existe.");
    await repository.rejectCandidate(candidateId, {
      actor,
      expectedVersion: formString(formData, "candidateVersion"),
      reason,
    });
  });
}

export async function blockCandidateAction(formData: FormData): Promise<never> {
  const candidateId = candidateIdFromForm(formData);
  const actor = await requireEditorialActor("catalog.review");
  const reason = formString(formData, "decisionReason");

  return completeAction(candidateId, "Candidatura bloqueada.", async () => {
    const repository = getAdminRepository();
    const candidate = await repository.getCandidate(candidateId);
    if (!candidate) throw new Error("La candidatura ya no existe.");
    await repository.blockCandidate(candidateId, {
      actor,
      expectedVersion: formString(formData, "candidateVersion"),
      reason,
    });
  });
}

export async function unblockCandidateAction(formData: FormData): Promise<never> {
  const candidateId = candidateIdFromForm(formData);
  const actor = await requireEditorialActor("catalog.review");
  const reason = formString(formData, "decisionReason");

  return completeAction(candidateId, "Candidatura desbloqueada y devuelta a revisión.", async () => {
    const repository = getAdminRepository();
    const candidate = await repository.getCandidate(candidateId);
    if (!candidate) throw new Error("La candidatura ya no existe.");
    await repository.unblockCandidate(candidateId, {
      actor,
      expectedVersion: formString(formData, "candidateVersion"),
      reason,
    });
  });
}

export async function requeryCandidateAction(formData: FormData): Promise<never> {
  const candidateId = candidateIdFromForm(formData);
  const actor = await requireEditorialActor("catalog.review");
  const reason = formString(formData, "maintenanceReason");

  return completeAction(candidateId, "Reconsulta solicitada.", async () => {
    const repository = getAdminRepository();
    const candidate = await repository.getCandidate(candidateId);
    if (!candidate) throw new Error("La candidatura ya no existe.");
    await repository.requestRequery(candidateId, {
      actor,
      expectedVersion: formString(formData, "candidateVersion"),
      reason: reason || undefined,
    });
  });
}

export async function reprocessCandidateAction(formData: FormData): Promise<never> {
  const candidateId = candidateIdFromForm(formData);
  const actor = await requireEditorialActor("catalog.review");
  const reason = formString(formData, "maintenanceReason");

  return completeAction(candidateId, "Reproceso solicitado.", async () => {
    const repository = getAdminRepository();
    const candidate = await repository.getCandidate(candidateId);
    if (!candidate) throw new Error("La candidatura ya no existe.");
    await repository.requestReprocess(candidateId, {
      actor,
      expectedVersion: formString(formData, "candidateVersion"),
      reason: reason || undefined,
    });
  });
}

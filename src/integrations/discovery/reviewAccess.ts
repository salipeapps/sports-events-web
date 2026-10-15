import "server-only";

import { canAdmin, type AdminSession } from "@/domain/adminAccess";
import type { DiscoveryReviewAccess } from "@/presentation/admin/discoveryReview";
import { commandConfig, commandsEnabled } from "./commandApi";

export function getDiscoveryReviewAccess(session: AdminSession): DiscoveryReviewAccess {
  let rejectionEnabled = commandsEnabled("rejection");
  let promotionEnabled = commandsEnabled("promotion");
  if (rejectionEnabled || promotionEnabled) {
    try {
      commandConfig();
    } catch {
      rejectionEnabled = false;
      promotionEnabled = false;
    }
  }
  return {
    subject: session.subject,
    canReject: canAdmin(session.role, "discovery.reject"),
    canPromote: canAdmin(session.role, "discovery.promote"),
    rejectionEnabled,
    promotionEnabled,
  };
}

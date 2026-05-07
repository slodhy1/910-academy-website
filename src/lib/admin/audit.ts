import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditActionType =
  | "grant_product"
  | "revoke_product"
  | "update_customer"
  | "create_product"
  | "update_product"
  | "delete_product"
  | "update_application"
  | "create_lead"
  | "update_lead"
  | "add_lead_note";

export type AuditInput = {
  adminUserId: string;
  adminEmail: string;
  actionType: AuditActionType;
  customerId?: string | null;
  productId?: string | null;
  applicationId?: string | null;
  leadId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Insert a row into admin_actions. Failure is logged but does not throw —
 * audit logging must never break the underlying business action.
 */
export async function logAdminAction(
  supabase: SupabaseClient,
  input: AuditInput
): Promise<void> {
  const { error } = await supabase.from("admin_actions").insert({
    admin_user_id: input.adminUserId,
    admin_email: input.adminEmail,
    action_type: input.actionType,
    customer_id: input.customerId ?? null,
    product_id: input.productId ?? null,
    application_id: input.applicationId ?? null,
    lead_id: input.leadId ?? null,
    metadata: input.metadata ?? null,
  });
  if (error) {
    console.error("[admin-audit] insert failed:", error);
  }
}

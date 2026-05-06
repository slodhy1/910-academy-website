"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function linkCustomerToAuthUser(
  email: string,
  authUserId: string,
  fullName: string
): Promise<{ linked: boolean }> {
  if (!email || !authUserId) return { linked: false };

  const sbServer = await createServerClient();
  const {
    data: { user },
  } = await sbServer.auth.getUser();
  if (
    !user ||
    user.id !== authUserId ||
    user.email?.toLowerCase() !== email.toLowerCase()
  ) {
    console.warn(
      "[sign-up] linkCustomerToAuthUser called with mismatched session",
      {
        sessionUserId: user?.id,
        claimedAuthUserId: authUserId,
        sessionEmail: user?.email,
        claimedEmail: email,
      }
    );
    return { linked: false };
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("customers")
    .select("id, auth_user_id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (!existing) {
    return { linked: false };
  }

  if (existing.auth_user_id && existing.auth_user_id !== authUserId) {
    console.warn(
      `[sign-up] customers row for ${email} already linked to ${existing.auth_user_id}, ignoring new ${authUserId}`
    );
    return { linked: false };
  }

  const update: { auth_user_id: string; full_name?: string } = {
    auth_user_id: authUserId,
  };
  if (!existing.full_name && fullName) {
    update.full_name = fullName;
  }

  const { error } = await supabase
    .from("customers")
    .update(update)
    .eq("id", existing.id);

  if (error) {
    console.error("[sign-up] link update failed:", error);
    return { linked: false };
  }

  return { linked: true };
}

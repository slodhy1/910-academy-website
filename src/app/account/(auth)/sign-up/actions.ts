"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export type SignUpResult =
  | { success: false; error: string }
  | { success: true; needsSignIn: true };

export async function signUpAndLink(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<SignUpResult> {
  const email = input.email.trim();
  const fullName = input.fullName.trim();
  const password = input.password;

  if (!email || !password || !fullName) {
    return { success: false, error: "All fields are required." };
  }
  if (password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const sbServer = await createServerClient();
  const { data, error: signUpErr } = await sbServer.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (signUpErr) {
    return { success: false, error: signUpErr.message };
  }
  if (!data.user) {
    return { success: false, error: "Sign-up returned no user." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("customers")
    .select("id, auth_user_id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    if (!existing.auth_user_id || existing.auth_user_id === data.user.id) {
      const update: { auth_user_id: string; full_name?: string } = {
        auth_user_id: data.user.id,
      };
      if (!existing.full_name && fullName) update.full_name = fullName;
      const { error: linkErr } = await admin
        .from("customers")
        .update(update)
        .eq("id", existing.id);
      if (linkErr) {
        console.error("[sign-up] link update failed:", linkErr);
      }
    } else {
      console.warn(
        `[sign-up] customers row for ${email} already linked to ${existing.auth_user_id}, ignoring new ${data.user.id}`
      );
    }
  }

  if (!data.session) {
    return { success: true, needsSignIn: true };
  }

  redirect("/account");
}

# Phase B v5 plan — post-purchase auth flow + signup polish

Diff-level precision. No file outside this list will be touched.

---

## Change 1 — middleware.ts: NO-OP

The `/account?purchase=success` → `/account/sign-up?purchase=success` unauth redirect is already at lines 60-64 (added in v3). Documented as already-correct in research.md. No diff.

---

## Change 2 — install Lucide

```bash
npm install lucide-react
```

Updates `package.json` + `package-lock.json`. Tree-shakable — we use only `Eye` and `EyeOff` icons, ~1.5 KB each.

---

## Change 3 — `src/components/PasswordInput.tsx` (new)

Reusable client component for the password field. Includes the eye toggle, and exports two small indicator components used by sign-up + settings.

```tsx
"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = {
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  className?: string;       // applied to <input> — defaults to "auth-input"
  id?: string;
  placeholder?: string;
};

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  className = "auth-input",
  id,
  placeholder,
}: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={id}
        type={revealed ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${className} pw-input`}
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="pw-toggle"
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        tabIndex={0}
      >
        {revealed ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
      <style>{`
        .pw-wrap { position: relative; display: block; }
        .pw-wrap .pw-input { width: 100%; padding-right: 44px; }
        .pw-toggle {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 0;
          color: var(--fg-muted);
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: color 0.15s;
        }
        .pw-toggle:hover { color: var(--fg); }
        .pw-toggle:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
      `}</style>
    </div>
  );
}

export function MinLengthIndicator({
  value,
  min,
}: {
  value: string;
  min: number;
}) {
  // Hide when empty (don't be aggressive). Show ✓/✗ once user types.
  if (value.length === 0) return null;
  const ok = value.length >= min;
  return (
    <p className={`pw-indicator${ok ? " pw-indicator-ok" : " pw-indicator-bad"}`}>
      <span aria-hidden>{ok ? "✓" : "✗"}</span> At least {min} characters
      <style>{`
        .pw-indicator { font-size: 12px; line-height: 1.4; margin-top: 2px; display: flex; gap: 6px; align-items: center; letter-spacing: 0.02em; }
        .pw-indicator-ok { color: #5fd16a; }
        .pw-indicator-bad { color: #ff6b6b; }
      `}</style>
    </p>
  );
}

export function MatchIndicator({
  a,
  b,
}: {
  a: string;
  b: string;
}) {
  if (b.length === 0) return null;
  const ok = a === b;
  return (
    <p className={`pw-indicator${ok ? " pw-indicator-ok" : " pw-indicator-bad"}`}>
      <span aria-hidden>{ok ? "✓" : "✗"}</span> {ok ? "Passwords match" : "Passwords don't match"}
      <style>{`
        .pw-indicator { font-size: 12px; line-height: 1.4; margin-top: 2px; display: flex; gap: 6px; align-items: center; letter-spacing: 0.02em; }
        .pw-indicator-ok { color: #5fd16a; }
        .pw-indicator-bad { color: #ff6b6b; }
      `}</style>
    </p>
  );
}
```

The two indicators duplicate their `<style>` block. Trade-off: zero coordination needed; React de-dupes scoped styles. Could extract a CSS module, but the inline-style pattern in this codebase is already widespread. Plan keeps consistent.

---

## Change 4 — `src/app/account/(auth)/sign-up/actions.ts` (rewrite)

Replace `linkCustomerToAuthUser` with `signUpAndLink`. Server-side signUp via SSR client (writes cookies), then admin-client link, then `redirect("/account")` on success-with-session.

```ts
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

  // Link any existing customers row by email (admin client).
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
        // Don't fail the signup — the customer is created in auth, they can still log in.
      }
    } else {
      console.warn(
        `[sign-up] customers row for ${email} already linked to ${existing.auth_user_id}, ignoring new ${data.user.id}`
      );
    }
  }

  if (!data.session) {
    // Defensive: only happens if email confirmation gets re-enabled in Supabase.
    return { success: true, needsSignIn: true };
  }

  redirect("/account"); // throws — never returns
}
```

Identity-guard from old `linkCustomerToAuthUser` is gone. The action IS the authority that creates both auth user and customers link, so impersonation surface is the same as it was before (sign-up always lets a user claim any email; that's by design with email confirmation off).

---

## Change 5 — `src/app/account/(auth)/sign-up/page.tsx` (rewrite onSubmit + form)

Drop client-side `supabase.auth.signUp`, drop `linkCustomerToAuthUser` import. Drop `info` state. Use `signUpAndLink` action + new components.

Key edits:
- Imports: replace `import { linkCustomerToAuthUser } from "./actions";` with `import { signUpAndLink } from "./actions";`. Add `import { PasswordInput, MinLengthIndicator, MatchIndicator } from "@/components/PasswordInput";`. Drop `import { createClient } from "@/lib/supabase/client";` (no longer needed).
- State: drop `const [info, setInfo] = useState<string | null>(null);` and `setInfo(null)` in onSubmit and the JSX render.
- onSubmit: simplify to a single server-action call.

```tsx
async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);

  if (!formValid) return;

  setLoading(true);
  const result = await signUpAndLink({
    email: email.trim(),
    password,
    fullName: fullName.trim(),
  });
  // If success-with-session, server-action redirected; this code doesn't run.
  if (!result.success) {
    setError(result.error);
    setLoading(false);
    return;
  }
  if (result.needsSignIn) {
    setError("Account created. Please sign in to continue.");
    setLoading(false);
  }
}
```

- `formValid` derived:

```ts
const isEmailLooking = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const formValid =
  fullName.trim().length > 0 &&
  isEmailLooking(email.trim()) &&
  password.length >= 8 &&
  confirm === password;
```

- Replace 2× password inputs with `<PasswordInput>`:

```diff
-        <label className="auth-label">
-          Password
-          <input
-            type="password"
-            value={password}
-            onChange={(e) => setPassword(e.target.value)}
-            required
-            minLength={8}
-            autoComplete="new-password"
-            className="auth-input"
-          />
-        </label>
+        <label className="auth-label">
+          Password
+          <PasswordInput
+            value={password}
+            onChange={setPassword}
+            required
+            minLength={8}
+            autoComplete="new-password"
+            className="auth-input"
+          />
+          <MinLengthIndicator value={password} min={8} />
+        </label>
-        <label className="auth-label">
-          Confirm password
-          <input
-            type="password"
-            value={confirm}
-            onChange={(e) => setConfirm(e.target.value)}
-            required
-            minLength={8}
-            autoComplete="new-password"
-            className="auth-input"
-          />
-        </label>
+        <label className="auth-label">
+          Confirm password
+          <PasswordInput
+            value={confirm}
+            onChange={setConfirm}
+            required
+            minLength={8}
+            autoComplete="new-password"
+            className="auth-input"
+          />
+          <MatchIndicator a={password} b={confirm} />
+        </label>
```

- Drop `{info && <p className="auth-info">{info}</p>}` from JSX.
- Drop `.auth-info { … }` from `<style>` block (no callers).
- Update button:

```diff
-        <button type="submit" disabled={loading} className="auth-btn">
+        <button type="submit" disabled={loading || !formValid} className="auth-btn">
           {loading ? "Creating account..." : "Create account"}
         </button>
```

---

## Change 6 — `src/app/account/(auth)/login/page.tsx` (1 password swap)

```diff
+import { PasswordInput } from "@/components/PasswordInput";
        <label className="auth-label">
          Password
-          <input
-            type="password"
-            value={password}
-            onChange={(e) => setPassword(e.target.value)}
-            required
-            autoComplete="current-password"
-            className="auth-input"
-          />
+          <PasswordInput
+            value={password}
+            onChange={setPassword}
+            required
+            autoComplete="current-password"
+            className="auth-input"
+          />
        </label>
```

No indicators (login uses existing password — no length/match logic).

---

## Change 7 — `src/app/account/(auth)/reset-password/page.tsx` (2 password swaps)

Both fields:

```diff
+import { PasswordInput, MinLengthIndicator, MatchIndicator } from "@/components/PasswordInput";

        <label className="auth-label">
          New password
-          <input
-            type="password"
-            value={password}
-            onChange={(e) => setPassword(e.target.value)}
-            required
-            autoComplete="new-password"
-            minLength={8}
-            className="auth-input"
-          />
+          <PasswordInput
+            value={password}
+            onChange={setPassword}
+            required
+            autoComplete="new-password"
+            minLength={8}
+            className="auth-input"
+          />
+          <MinLengthIndicator value={password} min={8} />
        </label>
        <label className="auth-label">
          Confirm password
-          <input
-            type="password"
-            value={confirm}
-            onChange={(e) => setConfirm(e.target.value)}
-            required
-            autoComplete="new-password"
-            minLength={8}
-            className="auth-input"
-          />
+          <PasswordInput
+            value={confirm}
+            onChange={setConfirm}
+            required
+            autoComplete="new-password"
+            minLength={8}
+            className="auth-input"
+          />
+          <MatchIndicator a={password} b={confirm} />
        </label>
```

(Per research §10: spec said "ALL password inputs" get eye toggle and explicitly named sign-up + settings for indicators. Reset-password has the same shape; consistency wins. Flagging — push back if you want indicators OFF here.)

---

## Change 8 — `src/app/account/(authed)/settings/forms.tsx` (3 password swaps + 2 indicators)

In the change-password form. Current password gets eye toggle ONLY (no indicator). New + confirm get eye toggle + indicators.

```diff
+import { PasswordInput, MinLengthIndicator, MatchIndicator } from "@/components/PasswordInput";

        <label className="settings-label">
          Current password
-          <input
-            type="password"
-            value={currentPassword}
-            onChange={(e) => setCurrentPassword(e.target.value)}
-            required
-            autoComplete="current-password"
-            className="settings-input"
-          />
+          <PasswordInput
+            value={currentPassword}
+            onChange={setCurrentPassword}
+            required
+            autoComplete="current-password"
+            className="settings-input"
+          />
        </label>
        <label className="settings-label">
          New password
-          <input
-            type="password"
-            value={newPassword}
-            onChange={(e) => setNewPassword(e.target.value)}
-            required
-            minLength={8}
-            autoComplete="new-password"
-            className="settings-input"
-          />
+          <PasswordInput
+            value={newPassword}
+            onChange={setNewPassword}
+            required
+            minLength={8}
+            autoComplete="new-password"
+            className="settings-input"
+          />
+          <MinLengthIndicator value={newPassword} min={8} />
        </label>
        <label className="settings-label">
          Confirm new password
-          <input
-            type="password"
-            value={confirmPassword}
-            onChange={(e) => setConfirmPassword(e.target.value)}
-            required
-            minLength={8}
-            autoComplete="new-password"
-            className="settings-input"
-          />
+          <PasswordInput
+            value={confirmPassword}
+            onChange={setConfirmPassword}
+            required
+            minLength={8}
+            autoComplete="new-password"
+            className="settings-input"
+          />
+          <MatchIndicator a={newPassword} b={confirmPassword} />
        </label>
```

The settings password change flow continues to use `signInWithPassword` + `updateUser` — not changed by this plan. Only the inputs and indicators.

---

## Order of operations in execute step

1. `npm install lucide-react`.
2. Create `src/components/PasswordInput.tsx`.
3. Rewrite `src/app/account/(auth)/sign-up/actions.ts`.
4. Edit `src/app/account/(auth)/sign-up/page.tsx`: imports, state, onSubmit, formValid, JSX swaps, indicators, disabled button, drop info.
5. Edit `src/app/account/(auth)/login/page.tsx`: 1 password swap.
6. Edit `src/app/account/(auth)/reset-password/page.tsx`: 2 password swaps + indicators.
7. Edit `src/app/account/(authed)/settings/forms.tsx`: 3 password swaps + 2 indicators.
8. `npm run build` — must pass clean.
9. STOP for "deploy".

---

## Files explicitly NOT touched

- `middleware.ts` — already correct.
- `src/lib/webhook/process-checkout.ts`, `src/app/api/stripe-webhook/route.ts` — webhook untouched.
- `emails/*.html`, smoke test, `customers` schema, marketing HTMLs — out of scope.
- `(auth)/forgot-password/page.tsx` — has only an email field, no password input.
- `next.config.ts`, `vercel.json` — out of scope.

---

## Risks / soft warnings

1. **Server-action redirect carries cookies**: verified pattern in Next 15 with `@supabase/ssr`. Cookies set during signUp are returned with the 303 from `redirect()`. If, somehow, the cookie write doesn't persist, the user lands on `/account` unauth and middleware bounces them to `/account/login` — annoying but not destructive. Easy to verify in Step 7 with a real signup test.
2. **Lucide tree-shake**: confirmed via `next build` output. If the bundle gets noticeably bigger, we can swap to inline SVG. ~1.5 KB icon × 2 = ~3 KB. Negligible.
3. **`MinLengthIndicator` and `MatchIndicator`** duplicate their `<style>` block. React de-dupes adjacent identical `<style>` nodes; bundle cost is one copy. Trade-off accepted for self-contained components.
4. **Settings form's "Current password" field**: gets eye toggle but no indicators. The "current" password length wasn't necessarily set under our 8-char rule (legacy users from any pre-rule signup), so checking 8+ on the current field would be wrong.
5. **Email regex** (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`): minimal validity check. Browser's `type="email"` does its own check; the regex here just gates the disabled button before form submit. Both run.
6. **`autoComplete` semantics**: kept `"new-password"` on signup/reset/settings-new fields, `"current-password"` on login + settings-current.
7. **Default state of Create Account button on first paint**: `formValid` is `false` (all fields empty). Button starts disabled. Visually matches existing `:disabled` style (opacity 0.6, cursor not-allowed). Good.
8. **The signup page's `info` state and `.auth-info` CSS rule**: both removed. If ever re-needed, can be re-added.

---

## Stop point

Execute does NOT begin until user replies "go".

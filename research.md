# Phase B v5 research — post-purchase auth flow + signup polish

## Change 1 — middleware redirect: ALREADY CORRECT

`middleware.ts` lines 60-64:

```ts
if (isAccountPage && !isAuthPage && !user) {
  if (path === "/account" && request.nextUrl.searchParams.get("purchase") === "success") {
    const target = new URL("/account/sign-up", request.url);
    target.searchParams.set("purchase", "success");
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(new URL("/account/login", request.url));
}
```

The `/account?purchase=success` → `/account/sign-up?purchase=success` unauth redirect was added in Phase B v3 and remains present. **No change needed.** Plan will document it in step 1 only and move on.

(Earlier `grep "purchase=success"` on the file returned nothing because the literal string isn't in the source — `searchParams.get("purchase") === "success"` is the actual matcher. False negative.)

## Change 2 — "Check your email" info box

`src/app/account/(auth)/sign-up/page.tsx`:

| Line | Content |
|---|---|
| 27 | `const [info, setInfo] = useState<string | null>(null);` |
| 33 | `setInfo(null);` |
| 79-81 | `setInfo("Check your email to confirm your account…")` |
| 142 | `{info && <p className="auth-info">{info}</p>}` |
| 163 | `.auth-info { … }` (CSS rule, can stay or be removed) |

**To remove**: drop the `info` state entirely (line 27, 33, 79-81), the JSX render (line 142), and optionally the CSS rule (line 163). Keeping the CSS rule is harmless dead code; removing is cleaner. Plan picks **remove the rule too** (no callers).

## Change 3 — Auto sign-in via server-action redirect

Current flow (client-driven):
1. `page.tsx` calls `supabase.auth.signUp()` from the **browser** SSR client (line 47-53). Cookie written browser-side.
2. Calls `linkCustomerToAuthUser` server action (line 63-67) which has an identity-guard verifying browser session matches claimed values.
3. If `data.session` present → `router.push("/account")` (line 73-76). Otherwise → set `info` ("Check your email…").

Spec wants the server action to do the work: signUp, link, redirect. Move signUp into the action so the SSR cookie write happens server-side and `redirect("/account")` issues an HTTP redirect with the session cookie attached. Eliminates the browser→server→browser round-trip.

**Implications:**
- The current identity-guard (lines 13-32 of `actions.ts`) becomes unnecessary — the action IS the authority that creates both records, so impersonation surface goes away.
- The form's onSubmit calls a single server action: `await signUpAndLink({ email, password, fullName })`. On success-with-session, the action throws `redirect("/account")` — Next handles navigation, the function never returns. On error, returns `{ success: false, error }`. On no-session (defensive: email confirmation unexpectedly enabled), returns `{ success: true, needsSignIn: true }` and the client surfaces a "Account created. Please sign in to continue." error.
- The existing `linkCustomerToAuthUser` export becomes redundant — only caller is the sign-up page. Plan: replace `linkCustomerToAuthUser` with new `signUpAndLink` (single public export).

**Cookie writing in server actions**: `@supabase/ssr`'s `createServerClient` from `src/lib/supabase/server.ts` is bound to `next/headers cookies()` and DOES write cookies during server actions. The `cookies()` API in Next 15 server actions is mutable. The set-cookie headers are returned with the action's response, so the redirect carries the new session.

## Change 4 — Eye toggle + 8-char/match indicators

8 password inputs across 4 files:

| File | Count | Roles |
|---|---|---|
| `(auth)/sign-up/page.tsx` | 2 | new + confirm |
| `(auth)/login/page.tsx` | 1 | current |
| `(auth)/reset-password/page.tsx` | 2 | new + confirm |
| `(authed)/settings/forms.tsx` | 3 | current + new + confirm |

**Extract to `src/components/PasswordInput.tsx`** as a reusable client component. API:

```ts
type Props = {
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  className?: string;  // class to apply to <input>; optional, default "auth-input" for auth-card forms, "settings-input" elsewhere
  id?: string;
  // No label — caller wraps in <label>.
};
```

Internal state: `const [revealed, setRevealed] = useState(false);`. Renders an absolutely-positioned `<button type="button">` overlaid on the right edge of the input. Click toggles `type` between `"password"` and `"text"`. Lucide-react Eye / EyeOff icons.

**Lucide-react NOT installed**. Plan adds: `npm install lucide-react`. Tree-shakable, named imports keep bundle small.

**Indicator components** (signup-page-only and settings-change-password-only):

- `<MinLengthIndicator value={password} min={8} />` — gray dot when value is empty, red ✗ when 0<len<8, green ✓ when len>=8.
- `<MatchIndicator a={password} b={confirm} />` — null when `b` is empty, red ✗ when b !== a, green ✓ when b === a && b !== "".

These are tiny 5-10 line inline components — plan colocates them in `PasswordInput.tsx` and exports them so signup/settings can import individually.

## Change 5 — Browser-side validation rules

Already present at the input level (`type="email"`, `required`, `minLength={8}`). The `disabled` Create Account button is the new piece — needs a `formValid` derived boolean:

```ts
const isEmailLooking = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const formValid =
  fullName.trim().length > 0 &&
  isEmailLooking(email.trim()) &&
  password.length >= 8 &&
  confirm === password;
```

`<button … disabled={loading || !formValid}>`. CSS already covers `:disabled` (line 161 of sign-up page).

## Files to touch

| File | Action |
|---|---|
| `package.json` + lock | npm install `lucide-react` |
| `src/components/PasswordInput.tsx` | new — reusable input + 2 indicator components |
| `src/app/account/(auth)/sign-up/page.tsx` | rewrite onSubmit to call new server action; replace 2× password inputs with `<PasswordInput>`; add indicators; add disabled button logic; remove info state/render/CSS |
| `src/app/account/(auth)/sign-up/actions.ts` | replace `linkCustomerToAuthUser` with `signUpAndLink` (server-side signUp + link + redirect) |
| `src/app/account/(auth)/login/page.tsx` | replace 1× password input with `<PasswordInput>` |
| `src/app/account/(auth)/reset-password/page.tsx` | replace 2× password inputs with `<PasswordInput>` |
| `src/app/account/(authed)/settings/forms.tsx` | replace 3× password inputs with `<PasswordInput>`; add indicators on new + confirm |

`middleware.ts`: no change.

## Risks / soft warnings

1. **Server-action signUp + redirect**: Next.js `redirect()` throws `NEXT_REDIRECT`, which Next's runtime catches and turns into a 303 with new cookies. The Set-Cookie header is included automatically because `createServerClient`'s cookie adapter writes via `cookies().set()` during the signUp call. Verified pattern.
2. **The browser form** still needs to handle the `success: true, needsSignIn: true` case (defensive). If email confirmation is unexpectedly enabled, the redirect doesn't fire and the form gets `{ needsSignIn: true }` — surface inline error, don't auto-redirect.
3. **`lucide-react` bundle size**: tree-shaken named imports add ~1.5 KB per icon used. We use 2 (Eye, EyeOff) → minor.
4. **Password input class**: caller passes `className`. Default to `"auth-input"`. Settings forms pass `"settings-input"`. The wrapper div needs CSS for relative positioning (so the eye button can be absolutely placed). Plan: `<PasswordInput>` renders a wrapper div with class `password-input-wrap` + scoped style block. Or applies the wrapper styling inline. Plan picks scoped `<style jsx>` per the existing pattern in this codebase (other auth pages embed styles).
5. **Eye-icon button position**: `position: absolute; right: 12px; top: 50%; transform: translateY(-50%);`. The input gets `padding-right: 44px` to leave room for the icon. Touch target 36×36 px minimum.
6. **`PasswordInput` is a client component** (uses useState). Marking with `"use client"` at top — but Next.js 15 will infer client-only for any file using hooks, so the directive is required.
7. **Settings change-password form**: indicators apply ONLY to "New password" and "Confirm new password" — NOT the "Current password" field. Current password has no length requirement (matches whatever the user already has set).
8. **Reset password page**: per spec, eye toggle goes on both fields. No length/match indicators called out for reset-password, but it has the same shape as signup change-password. Plan: keep consistent — apply MinLength + Match indicators on reset-password too. (Spec says "ALL password inputs" get eye toggle; spec only spells out indicators for sign-up and settings. Plan errs on consistency: same UX everywhere reduces cognitive load. Will flag this as a minor deviation/expansion.)
9. **Form-validity gate** (disabled Create Account button): only on sign-up per spec. Login/reset/settings buttons remain enabled (they have their own loading/error handling). Plan respects spec.
10. **Auto-redirect after settings password change**: spec says the settings form's password change re-uses signInWithPassword + updateUser. Current code in `forms.tsx` does this. Spec doesn't ask to change it. Plan: leave that flow as-is, only add eye toggle and indicators.

## Open items requiring user decision

- **Reset-password indicators**: spec is silent. Plan defaults to applying min-length + match indicators for consistency. Push back if you want them off there.
- **Server-action vs. keep-client signUp**: spec is clear that signUp moves to server action. Plan complies. Restating for confirmation: the form will do `await signUpAndLink({...})` from `onSubmit`, the action throws `redirect("/account")` on success. Old `linkCustomerToAuthUser` export goes away.

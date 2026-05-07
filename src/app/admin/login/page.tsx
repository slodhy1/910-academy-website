import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Admin";
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <LoginForm siteName={siteName} />
    </div>
  );
}

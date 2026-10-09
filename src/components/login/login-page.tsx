import { BrandPanel } from "@/components/login/brand-panel";
import { LoginForm } from "@/components/login/login-form";

export function LoginPage() {
  return (
    <div className="flex min-h-screen w-full">
      {/* Left — Branding panel (hidden on mobile) */}
      <BrandPanel />

      {/* Right — Login form */}
      <div className="flex flex-1 flex-col bg-white lg:w-[45%]">
        <LoginForm />
      </div>
    </div>
  );
}

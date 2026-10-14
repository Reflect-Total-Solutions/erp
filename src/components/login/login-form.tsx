"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Mail, Lock, Loader2, ArrowLeft, CheckCircle2, ShieldCheck, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/login/password-input";
import { useTheme } from "@/context/theme-context";

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export function LoginForm() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  // Mode: "login" | "forgot"
  const [viewMode, setViewMode] = React.useState<"login" | "forgot">("login");

  // Login form state
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});

  // Forgot password form state
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [forgotError, setForgotError] = React.useState("");
  const [forgotLoading, setForgotLoading] = React.useState(false);
  const [forgotSuccess, setForgotSuccess] = React.useState(false);

  const validateLoginForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email or username is required";
    }

    if (!password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateLoginForm()) return;

    setIsLoading(true);
    setErrors({});

    // Simulate login verification
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Allow user to login to admin dashboard directly
    setIsLoading(false);
    router.push("/admin");
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");

    if (!forgotEmail.trim()) {
      setForgotError("Please enter your registered email address");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
      setForgotError("Please enter a valid email address");
      return;
    }

    setForgotLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setForgotLoading(false);
    setForgotSuccess(true);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-slate-50/80 px-4 py-8">
      {/* Theme Toggle Top Right */}
      <div className="absolute top-4 right-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 shadow-2xs hover:bg-slate-100 transition-colors cursor-pointer"
          title={theme === "dark" ? "Switch to White (Light) mode" : "Switch to Dark mode"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <>
              <Sun className="h-3.5 w-3.5 text-amber-400" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-slate-600" />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>

      <div className="w-full max-w-[390px] rounded-2xl border border-slate-200 bg-white p-7 shadow-xs">
        {/* Brand Logo & Name */}
        <div className="flex flex-col items-center justify-center text-center mb-6 pb-5 border-b border-slate-100">
          <div className="relative flex h-14 w-auto items-center justify-center overflow-hidden mb-2">
            <Image
              src="/logo.png"
              alt="Reflect Total Solutions"
              width={100}
              height={56}
              className="h-full w-auto object-contain"
              style={{ width: "auto", height: "auto" }}
              priority
            />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900 tracking-tight block">
              Reflect Total Solutions
            </span>
            <span className="text-[10px] font-semibold text-blue-600 tracking-wider">
              ERP SYSTEM
            </span>
          </div>
        </div>

        {/* ================= VIEW: LOGIN ================= */}
        {viewMode === "login" && (
          <div>
            <div className="mb-5">
              <h1 className="text-lg font-bold text-slate-900">Sign In</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter your credentials to access the ERP panel
              </p>
            </div>

            {/* Error Message */}
            {errors.general && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
                {errors.general}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {/* Email / Username */}
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Email or Username
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Mail className="h-3.5 w-3.5" />
                  </div>
                  <input
                    id="email"
                    type="text"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="admin@company.com"
                    autoComplete="username"
                    disabled={isLoading}
                    className={cn(
                      "flex h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors",
                      errors.email && "border-red-500 focus:border-red-500"
                    )}
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] text-red-500 mt-0.5">{errors.email}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password
                </label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password)
                      setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isLoading}
                  error={errors.password}
                  className="h-9 text-xs"
                />
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setViewMode("forgot");
                    setForgotSuccess(false);
                    setForgotError("");
                  }}
                  className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-2 flex h-9 w-full items-center justify-center rounded-lg bg-[#2563EB] text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] active:bg-[#1e40af] disabled:opacity-70 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>
        )}

        {/* ================= VIEW: FORGOT PASSWORD ================= */}
        {viewMode === "forgot" && (
          <div>
            <button
              type="button"
              onClick={() => {
                setViewMode("login");
                setForgotSuccess(false);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 mb-4 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Login
            </button>

            <div className="mb-5">
              <h1 className="text-lg font-bold text-slate-900">Forgot Password</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter your work email and we will send you a password reset link.
              </p>
            </div>

            {forgotSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-center space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="text-xs font-bold text-emerald-900">Reset Link Sent</h3>
                <p className="text-[11px] text-emerald-700 leading-relaxed">
                  We have sent instructions to <strong>{forgotEmail}</strong>. Please check your inbox.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode("login");
                    setForgotSuccess(false);
                  }}
                  className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                {forgotError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
                    {forgotError}
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="forgot-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Mail className="h-3.5 w-3.5" />
                    </div>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => {
                        setForgotEmail(e.target.value);
                        if (forgotError) setForgotError("");
                      }}
                      placeholder="name@company.com"
                      autoFocus
                      disabled={forgotLoading}
                      className="flex h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex h-9 w-full items-center justify-center rounded-lg bg-[#2563EB] text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] disabled:opacity-70 transition-colors"
                >
                  {forgotLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Sending reset link...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Security badge at bottom */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          <span>Reflect Enterprise ERP • Secure Portal</span>
        </div>
      </div>
    </div>
  );
}

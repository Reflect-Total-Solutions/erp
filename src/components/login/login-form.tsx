"use client";

import * as React from "react";
import Image from "next/image";
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
  const { theme, toggleTheme } = useTheme();

  // Mode: "login" | "change-password"
  const [viewMode, setViewMode] = React.useState<"login" | "change-password">("login");

  // First-time login password change state
  const [firstLoginEmail, setFirstLoginEmail] = React.useState("");
  const [firstLoginTempPassword, setFirstLoginTempPassword] = React.useState("");
  const [firstLoginUserName, setFirstLoginUserName] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [changePasswordLoading, setChangePasswordLoading] = React.useState(false);
  const [changePasswordError, setChangePasswordError] = React.useState("");

  // Notice dismissal state
  const [noticeDismissed, setNoticeDismissed] = React.useState(false);

  // Safely detect if navigated after logout without SSR hydration mismatch
  const wasLoggedOut = React.useSyncExternalStore(
    () => () => {},
    () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        return (
          urlParams.get("logged_out") === "1" ||
          sessionStorage.getItem("erp_just_logged_out") === "1"
        );
      } catch {
        return false;
      }
    },
    () => false
  );

  const showLoggedOutNotice = wasLoggedOut && !noticeDismissed;
  const formKey = wasLoggedOut ? "form-logged-out" : "form-default";

  // Form DOM element references
  const formRef = React.useRef<HTMLFormElement>(null);
  const emailInputRef = React.useRef<HTMLInputElement>(null);
  const passwordInputRef = React.useRef<HTMLInputElement>(null);

  // Login form state
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});

  // Full clear of both React state and DOM inputs (only invoked explicitly on logout/bfcache)
  const clearAllInputs = React.useCallback(() => {
    setEmail("");
    setPassword("");
    setErrors({});
    if (emailInputRef.current) {
      emailInputRef.current.value = "";
    }
    if (passwordInputRef.current) {
      passwordInputRef.current.value = "";
    }
    formRef.current?.reset();
  }, []);

  // Clean logout flags once on mount and wipe inputs ONLY on true bfcache restoration
  React.useEffect(() => {
    try {
      const justLoggedOut =
        sessionStorage.getItem("erp_just_logged_out") === "1" ||
        (typeof window !== "undefined" && window.location.search.includes("logged_out"));
      if (justLoggedOut) {
        sessionStorage.removeItem("erp_just_logged_out");
        if (typeof window !== "undefined" && window.location.search.includes("logged_out")) {
          window.history.replaceState({}, "", "/");
        }
      }
    } catch {
      // Ignore storage access errors
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        clearAllInputs();
      }
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [clearAllInputs]);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!noticeDismissed) setNoticeDismissed(true);
    setEmail(e.target.value);
    if (errors.email || errors.general) {
      setErrors((prev) => ({ ...prev, email: undefined, general: undefined }));
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!noticeDismissed) setNoticeDismissed(true);
    setPassword(e.target.value);
    if (errors.password || errors.general) {
      setErrors((prev) => ({ ...prev, password: undefined, general: undefined }));
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    // Fallback to live DOM input values in case mobile password manager/autofill skipped onChange
    const currentEmail = (email || emailInputRef.current?.value || "").trim();
    const currentPassword = password || passwordInputRef.current?.value || "";

    const newErrors: FormErrors = {};
    if (!currentEmail) {
      newErrors.email = "Email or username is required";
    }
    if (!currentPassword) {
      newErrors.password = "Password is required";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    if (!noticeDismissed) setNoticeDismissed(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: currentEmail, password: currentPassword }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        const message =
          res.status === 429
            ? (data?.error ?? "Too many attempts. Please wait and try again.")
            : (data?.error ?? "Invalid email or password");
        setErrors({ general: message });
        return;
      }

      // Check if first-time login requires mandatory password change
      if (data?.mustChangePassword) {
        setFirstLoginEmail(currentEmail.toLowerCase());
        setFirstLoginTempPassword(currentPassword);
        setFirstLoginUserName(data.user?.name || "");
        setChangePasswordError("");
        setNewPassword("");
        setConfirmPassword("");
        setViewMode("change-password");
        return;
      }

      // Redirect to originally requested page or dashboard
      const params = new URLSearchParams(window.location.search);
      const rawRedirect = params.get("redirect");
      const redirectTo =
        rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
          ? rawRedirect
          : "/admin";
      clearAllInputs();
      window.location.replace(redirectTo);
    } catch {
      setErrors({
        general:
          "Unable to reach the server. Please check your internet connection and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError("");

    if (!firstLoginTempPassword) {
      setChangePasswordError("Please enter your current temporary password.");
      return;
    }

    if (!newPassword) {
      setChangePasswordError("Please enter your new password.");
      return;
    }

    if (newPassword.length < 8) {
      setChangePasswordError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword === firstLoginTempPassword) {
      setChangePasswordError("New password cannot be the same as your temporary password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setChangePasswordError("Passwords do not match. Please verify both fields.");
      return;
    }

    setChangePasswordLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: firstLoginEmail,
          currentPassword: firstLoginTempPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setChangePasswordError(data.error || "Failed to update password. Please try again.");
        return;
      }

      // Success: redirect to dashboard
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirect") ?? "/admin";
      clearAllInputs();
      setNewPassword("");
      setConfirmPassword("");
      window.location.replace(redirectTo);
    } catch {
      setChangePasswordError("Network connection error. Could not save password.");
    } finally {
      setIsLoading(false);
      setChangePasswordLoading(false);
    }
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
          <div className="flex items-center justify-center mb-2.5">
            <Image
              src="/logo.png"
              alt="Reflect Total Solutions"
              width={140}
              height={122}
              className="h-24 w-auto object-contain dark:bg-white/95 dark:p-1.5 dark:rounded-xl transition-all"
              priority
            />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900 tracking-tight block">
              Reflect Total Solutions
            </span>
            <span className="text-[10px] font-semibold text-blue-600 tracking-wider block mt-0.5">
              ENTERPRISE ERP
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

            {/* Logged Out Success Notice */}
            {showLoggedOutNotice && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 animate-in fade-in duration-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="leading-tight">
                  You have been securely logged out. Input fields have been cleared.
                </span>
              </div>
            )}

            {/* General Error Message */}
            {errors.general && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
                {errors.general}
              </div>
            )}

            <form
              key={formKey}
              ref={formRef}
              onSubmit={handleLoginSubmit}
              noValidate
              className="space-y-4"
            >
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
                    ref={emailInputRef}
                    id="email"
                    name="email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={handleEmailChange}
                    placeholder="admin@company.com"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
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
                  ref={passwordInputRef}
                  id="password"
                  name="password"
                  value={password}
                  leftIcon={<Lock className="h-3.5 w-3.5" />}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={isLoading}
                  error={errors.password}
                  className="h-9 text-xs"
                />
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

        {/* ================= VIEW: FIRST-TIME LOGIN PASSWORD CHANGE ================= */}
        {viewMode === "change-password" && (
          <div>
            <div className="mb-4">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-semibold mb-2">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                <span>First-Time Security Setup</span>
              </div>
              <h1 className="text-lg font-bold text-slate-900">Set Permanent Password</h1>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Welcome{firstLoginUserName ? `, ${firstLoginUserName}` : ""}! Because you are logging in with a temporary password, you must create your personal password to access the ERP system.
              </p>
            </div>

            {changePasswordError && (
              <div className="mb-3.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 flex items-start gap-1.5">
                <span className="font-semibold block">{changePasswordError}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5">
              {/* Account Identifier */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
                <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Signing in as
                </span>
                <span className="block text-xs font-mono font-semibold text-slate-900 truncate mt-0.5">
                  {firstLoginEmail}
                </span>
              </div>

              {/* Current / Temporary Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Current / Temporary Password <span className="text-rose-500">*</span>
                </label>
                <PasswordInput
                  value={firstLoginTempPassword}
                  onChange={(e) => {
                    setFirstLoginTempPassword(e.target.value);
                    if (changePasswordError) setChangePasswordError("");
                  }}
                  placeholder="Enter current temporary password..."
                  disabled={changePasswordLoading}
                  leftIcon={<Lock className="h-3.5 w-3.5" />}
                />
              </div>

              {/* New Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  New Password <span className="text-rose-500">*</span>
                </label>
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (changePasswordError) setChangePasswordError("");
                  }}
                  placeholder="Minimum 8 characters..."
                  disabled={changePasswordLoading}
                  leftIcon={<Lock className="h-3.5 w-3.5" />}
                  autoFocus
                />
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Confirm New Password <span className="text-rose-500">*</span>
                </label>
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (changePasswordError) setChangePasswordError("");
                  }}
                  placeholder="Re-enter your new password..."
                  disabled={changePasswordLoading}
                  leftIcon={<Lock className="h-3.5 w-3.5" />}
                />
              </div>

              <div className="text-[11px] text-slate-500 space-y-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      newPassword.length >= 8 ? "bg-emerald-500" : "bg-slate-300"
                    )}
                  />
                  <span>Minimum 8 characters</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      confirmPassword && newPassword === confirmPassword
                        ? "bg-emerald-500"
                        : "bg-slate-300"
                    )}
                  />
                  <span>Passwords match</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={changePasswordLoading}
                className="flex h-9 w-full items-center justify-center rounded-lg bg-[#2563EB] text-xs font-semibold text-white shadow-xs hover:bg-[#1d4ed8] active:bg-[#1e40af] disabled:opacity-70 transition-colors cursor-pointer mt-2"
              >
                {changePasswordLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    <span>Saving Password & Entering...</span>
                  </>
                ) : (
                  "Save Password & Enter ERP"
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode("login");
                  setNewPassword("");
                  setConfirmPassword("");
                  setChangePasswordError("");
                }}
                disabled={changePasswordLoading}
                className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors w-full pt-1 cursor-pointer"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Return to Sign In</span>
              </button>
            </form>
          </div>
        )}

        {/* Security badge at bottom */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          <span>Reflect Enterprise ERP &bull; Secure Portal</span>
        </div>
      </div>
    </div>
  );
}

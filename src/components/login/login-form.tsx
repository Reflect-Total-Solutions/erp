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

  // Mode: "login" | "forgot" | "change-password"
  const [viewMode, setViewMode] = React.useState<"login" | "forgot" | "change-password">("login");

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

  // Only genuine user physical typing turns this true
  const hasUserTypedRef = React.useRef(false);

  // Login form state
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});

  // Helper to directly wipe DOM input elements (no React state updates, safe for effect body)
  const resetDOMInputs = React.useCallback(() => {
    if (emailInputRef.current) {
      emailInputRef.current.value = "";
      emailInputRef.current.defaultValue = "";
    }
    if (passwordInputRef.current) {
      passwordInputRef.current.value = "";
      passwordInputRef.current.defaultValue = "";
    }
    formRef.current?.reset();
  }, []);

  // Full clear of both React state and DOM inputs
  const clearAllInputs = React.useCallback(() => {
    setEmail("");
    setPassword("");
    setRememberMe(false);
    setErrors({});
    resetDOMInputs();
  }, [resetDOMInputs]);

  // Ensure all input fields are wiped on mount, after logout, or on bfcache back/forward navigation
  React.useEffect(() => {
    // Immediate DOM reset
    resetDOMInputs();

    // Clean up sessionStorage flag and URL query param without triggering re-renders
    try {
      if (sessionStorage.getItem("erp_just_logged_out") === "1") {
        sessionStorage.removeItem("erp_just_logged_out");
      }
      if (typeof window !== "undefined" && window.location.search.includes("logged_out")) {
        window.history.replaceState({}, "", "/");
      }
    } catch {
      // Ignore storage access errors
    }

    // Schedule enforcement sweeps across first 1.2s to block delayed browser autofills
    const delays = [30, 80, 160, 300, 500, 850, 1200];
    const timers = delays.map((d) =>
      setTimeout(() => {
        if (!hasUserTypedRef.current) {
          clearAllInputs();
        }
      }, d)
    );

    // If navigated via browser back/forward or restored from bfcache
    const handlePageShow = () => {
      hasUserTypedRef.current = false;
      clearAllInputs();
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [clearAllInputs, resetDOMInputs]);

  // Forgot password form state
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [forgotError, setForgotError] = React.useState("");
  const [forgotLoading, setForgotLoading] = React.useState(false);
  const [forgotSuccess, setForgotSuccess] = React.useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Only genuine printable keystrokes, backspace, delete, paste count as user interaction
    if (
      e.key.length === 1 ||
      e.key === "Backspace" ||
      e.key === "Delete" ||
      (e.ctrlKey && e.key.toLowerCase() === "v") ||
      (e.metaKey && e.key.toLowerCase() === "v")
    ) {
      hasUserTypedRef.current = true;
      if (!noticeDismissed) setNoticeDismissed(true);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.isTrusted && e.target.value.length > 0) {
      hasUserTypedRef.current = true;
      if (!noticeDismissed) setNoticeDismissed(true);
    }
    setEmail(e.target.value);
    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.isTrusted && e.target.value.length > 0) {
      hasUserTypedRef.current = true;
      if (!noticeDismissed) setNoticeDismissed(true);
    }
    setPassword(e.target.value);
    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
  };

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
    if (!noticeDismissed) setNoticeDismissed(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        const message =
          res.status === 429
            ? (data.error ?? "Too many attempts. Please wait and try again.")
            : (data.error ?? "Invalid email or password");
        setErrors({ general: message });
        return;
      }

      // Check if first-time login requires mandatory password change
      if (data.mustChangePassword) {
        setFirstLoginEmail(email.trim().toLowerCase());
        setFirstLoginTempPassword(password);
        setFirstLoginUserName(data.user?.name || "");
        setChangePasswordError("");
        setNewPassword("");
        setConfirmPassword("");
        setViewMode("change-password");
        return;
      }

      // Redirect to originally requested page or dashboard
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirect") ?? "/admin";
      clearAllInputs();
      window.location.replace(redirectTo);
    } catch {
      // In UI prototype mode (backend offline), set demo preview cookie and allow entry
      document.cookie = "erp_session=demo-preview-token; path=/; max-age=86400; SameSite=Lax";
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get("redirect") ?? "/admin";
      clearAllInputs();
      window.location.replace(redirectTo);
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
              autoComplete="off"
              className="space-y-4"
            >
              {/* Invisible decoy inputs to absorb browser autofill after logout */}
              <div
                style={{
                  position: "absolute",
                  left: "-9999px",
                  opacity: 0,
                  height: 0,
                  width: 0,
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              >
                <input
                  type="text"
                  name="fake_user_autofill"
                  tabIndex={-1}
                  autoComplete="off"
                />
                <input
                  type="password"
                  name="fake_pass_autofill"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

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
                    name="erp_login_email"
                    type="text"
                    value={email}
                    onKeyDown={handleKeyDown}
                    onChange={handleEmailChange}
                    placeholder="admin@company.com"
                    autoComplete="off"
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
                  name="erp_login_password"
                  value={password}
                  leftIcon={<Lock className="h-3.5 w-3.5" />}
                  onKeyDown={handleKeyDown}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                  autoComplete="new-password"
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
                    setNoticeDismissed(true);
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
                hasUserTypedRef.current = false;
                clearAllInputs();
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
                    hasUserTypedRef.current = false;
                    clearAllInputs();
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

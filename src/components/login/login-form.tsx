"use client";

import * as React from "react";
import { Mail, Loader2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/login/password-input";
import { SecurityMessage } from "@/components/login/security-message";

// Simple inline SVG for Microsoft logo
function MicrosoftLogo() {
  return (
    <svg className="h-4 w-4 mr-2" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export function LoginForm() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isSuccess, setIsSuccess] = React.useState(false);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!email.trim()) {
      newErrors.email = "Email or username is required";
    } else if (
      email.includes("@") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    // Simulate authentication
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate error for demo (use admin@company.com / password123 to succeed)
    if (email === "admin@company.com" && password === "password123") {
      setIsSuccess(true);
      // In production, redirect to dashboard
    } else {
      setErrors({
        general: "Invalid credentials. Please check your email and password.",
      });
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="text-center animate-fade-in-up">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <svg
              className="h-7 w-7 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#0F172A] mb-1">
            Welcome back!
          </h2>
          <p className="text-sm text-[#64748B]">
            Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 xl:px-20">
      <div className="w-full max-w-[400px] mx-auto">
        {/* Mobile logo */}
        <div className="flex items-center gap-2.5 mb-10 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2563EB] shadow-sm">
            <BarChart3 className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold text-[#0F172A] tracking-tight">
              YOUR COMPANY
            </span>
            <span className="text-[9px] font-semibold text-[#2563EB] tracking-[0.15em] block -mt-0.5">
              ERP
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight mb-1.5">
            Welcome Back
          </h1>
          <p className="text-sm text-[#64748B]">
            Sign in to your ERP account to continue.
          </p>
        </div>

        {/* Error banner */}
        {errors.general && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 animate-fade-in-up">
            <p className="text-sm text-red-600">{errors.general}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email field */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[#0F172A]"
            >
              Email or Username
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                placeholder="Enter your email or username"
                autoComplete="username"
                autoFocus
                disabled={isLoading}
                className={cn(
                  "flex h-10 w-full rounded-xl border border-[#E2E8F0] bg-white pl-9 pr-3 py-2 text-sm text-[#0F172A] ring-offset-white placeholder:text-[#94A3B8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 focus-visible:border-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200",
                  errors.email &&
                    "border-red-500 focus-visible:ring-red-500/20 focus-visible:border-red-500"
                )}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
            </div>
            {errors.email && (
              <p id="email-error" className="text-xs text-red-500 mt-1">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[#0F172A]"
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
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={isLoading}
              error={errors.password}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
            />
          </div>

          {/* Remember me & Forgot password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="peer h-4 w-4 shrink-0 rounded border border-[#E2E8F0] shadow-sm accent-[#2563EB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 cursor-pointer transition-colors duration-200"
              />
              <span className="text-sm text-[#64748B] group-hover:text-[#475569] transition-colors duration-200">
                Remember me
              </span>
            </label>
            <button
              type="button"
              className="text-sm font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors duration-200"
            >
              Forgot password?
            </button>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className="relative flex w-full items-center justify-center h-10 rounded-xl bg-[#2563EB] text-sm font-medium text-white shadow-sm hover:bg-[#1d4ed8] active:bg-[#1e40af] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E2E8F0]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-[#94A3B8] font-medium">
              OR
            </span>
          </div>
        </div>

        {/* SSO Button */}
        <button
          type="button"
          disabled={isLoading}
          className="flex w-full items-center justify-center h-10 rounded-xl border border-[#E2E8F0] bg-white text-sm font-medium text-[#0F172A] shadow-sm hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          <MicrosoftLogo />
          Continue with Microsoft
        </button>

        {/* Help text */}
        <p className="mt-8 text-center text-xs text-[#94A3B8]">
          Need help?{" "}
          <button
            type="button"
            className="font-medium text-[#64748B] hover:text-[#0F172A] transition-colors duration-200"
          >
            Contact your administrator
          </button>
        </p>

        {/* Security message */}
        <div className="mt-6">
          <SecurityMessage />
        </div>
      </div>
    </div>
  );
}

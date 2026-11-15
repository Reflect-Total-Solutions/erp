"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/admin/ui/modal";
import { SupplierPaymentSettings } from "@/types/admin";
import { AlertTriangle, Bell, CheckCircle2, Globe, Loader2, Mail, Play, X } from "lucide-react";

interface SupplierPaymentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsUpdated?: () => void;
}

const TIMEZONE_PRESETS = [
  "Asia/Colombo",
  "UTC",
  "Asia/Singapore",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
];

export function SupplierPaymentSettingsModal({
  isOpen,
  onClose,
  onSettingsUpdated,
}: SupplierPaymentSettingsModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const [timezone, setTimezone] = useState("Asia/Colombo");
  const [reminderDaysInput, setReminderDaysInput] = useState("7, 3, 1");
  const [notifyOnDueToday, setNotifyOnDueToday] = useState(true);
  const [notifyDailyOverdue, setNotifyDailyOverdue] = useState(true);
  const [notifyOnPartialPayment, setNotifyOnPartialPayment] = useState(true);
  const [notifyOnFullPayment, setNotifyOnFullPayment] = useState(true);
  const [emailRemindersEnabled, setEmailRemindersEnabled] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      setIsLoading(true);
      setError("");
      setFeedback("");
      fetch("/api/supplier-payments/settings")
        .then((res) => res.json())
        .then((json) => {
          if (cancelled) return;
          if (json.success && json.data) {
            const s: SupplierPaymentSettings = json.data;
            setTimezone(s.timezone || "Asia/Colombo");
            setReminderDaysInput((s.upcomingReminderDays || [7, 3, 1]).join(", "));
            setNotifyOnDueToday(Boolean(s.notifyOnDueToday));
            setNotifyDailyOverdue(Boolean(s.notifyDailyOverdue));
            setNotifyOnPartialPayment(Boolean(s.notifyOnPartialPayment));
            setNotifyOnFullPayment(Boolean(s.notifyOnFullPayment));
            setEmailRemindersEnabled(Boolean(s.emailRemindersEnabled));
          } else if (json.error) {
            setError(json.error);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err?.message || "Failed to load payment reminder settings.");
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen]);

  const parseDaysArray = (raw: string): number[] => {
    const nums = raw
      .split(/[,;\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 365);
    return Array.from(new Set(nums)).sort((a, b) => b - a);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError("");
    setFeedback("");

    const parsedDays = parseDaysArray(reminderDaysInput);
    if (parsedDays.length === 0) {
      setError("Enter at least one positive day threshold (e.g. 7, 3, 1).");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/supplier-payments/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: timezone.trim() || "Asia/Colombo",
          upcomingReminderDays: parsedDays,
          notifyOnDueToday,
          notifyDailyOverdue,
          notifyOnPartialPayment,
          notifyOnFullPayment,
          emailRemindersEnabled,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error || "Failed to save notification settings.");
        return;
      }
      setReminderDaysInput((json.data?.upcomingReminderDays || parsedDays).join(", "));
      setFeedback("Notification preferences saved successfully.");
      onSettingsUpdated?.();
    } catch (err: any) {
      setError(err?.message || "Failed to save notification settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunReminderSweep = async () => {
    if (isRunningCheck) return;
    setError("");
    setFeedback("");
    setIsRunningCheck(true);
    try {
      const res = await fetch("/api/supplier-payments/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error || "Failed to run payment reminder sweep.");
        return;
      }
      const stats = json.data || {};
      setFeedback(
        `Reminder check completed (${stats.targetDateKey || "today"}): ${stats.createdCount ?? 0} notification(s) generated, ${stats.emailedCount ?? 0} email(s) sent, ${stats.skippedCount ?? 0} already sent.`
      );
      onSettingsUpdated?.();
    } catch (err: any) {
      setError(err?.message || "Failed to execute reminder sweep.");
    } finally {
      setIsRunningCheck(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Supplier Payment Notification & Reminder Settings"
      description="Configure upcoming due alerts, overdue checks, timezone, and optional email notifications"
      maxWidth="lg"
    >
      {isLoading ? (
        <div className="py-12 text-center text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-xs">Loading reminder settings...</p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 text-xs text-slate-800">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError("")}
                className="text-rose-400 hover:text-rose-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {feedback && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="flex-1">{feedback}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
                <Globe className="h-3.5 w-3.5 text-blue-600" />
                <span>Business Timezone</span>
              </label>
              <select
                value={TIMEZONE_PRESETS.includes(timezone) ? timezone : "__custom__"}
                onChange={(e) => {
                  if (e.target.value !== "__custom__") setTimezone(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONE_PRESETS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
                {!TIMEZONE_PRESETS.includes(timezone) && (
                  <option value="__custom__">{timezone}</option>
                )}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
                <Bell className="h-3.5 w-3.5 text-blue-600" />
                <span>Upcoming Reminder Days</span>
              </label>
              <input
                type="text"
                value={reminderDaysInput}
                onChange={(e) => setReminderDaysInput(e.target.value)}
                placeholder="7, 3, 1"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Comma-separated days before due date.</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
              In-App Alert Triggers
            </h4>
            {[
              {
                checked: notifyOnDueToday,
                setter: setNotifyOnDueToday,
                title: "Notify on Due Date (Due Today)",
                desc: "Creates an in-app bell alert when an unpaid invoice reaches its Payment Due Date.",
              },
              {
                checked: notifyDailyOverdue,
                setter: setNotifyDailyOverdue,
                title: "Daily Overdue Alerts",
                desc: "Creates daily reminders for past-due Supplier Invoices until settled.",
              },
              {
                checked: notifyOnPartialPayment,
                setter: setNotifyOnPartialPayment,
                title: "Partial Payment Recorded Alerts",
                desc: "Logs an activity notification whenever a partial payment is submitted.",
              },
              {
                checked: notifyOnFullPayment,
                setter: setNotifyOnFullPayment,
                title: "Full Settlement Completed Alerts",
                desc: "Logs a confirmation notification when an invoice reaches Paid status.",
              },
            ].map((item) => (
              <label key={item.title} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.setter(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block">{item.title}</span>
                  <span className="text-[10px] text-slate-500">{item.desc}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={emailRemindersEnabled}
                onChange={(e) => setEmailRemindersEnabled(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                  <span>Enable Email Reminders (Optional)</span>
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Disabled by default. Requires `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` environment variables; otherwise skips email gracefully while keeping in-app notifications active.
                </span>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleRunReminderSweep}
              disabled={isRunningCheck}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold cursor-pointer disabled:opacity-50"
            >
              {isRunningCheck ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span>Run Reminder Check Now</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Save Settings</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

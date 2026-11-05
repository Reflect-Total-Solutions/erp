import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProcessingOverlayProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  currentStep?: string;
  progressPercent?: number;
  className?: string;
}

export function ProcessingOverlay({
  isOpen,
  title = "Processing Request",
  description = "Please wait while the system securely processes your request...",
  currentStep,
  progressPercent,
  className,
}: ProcessingOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200 text-center space-y-4",
          className
        )}
      >
        <div className="relative mx-auto h-14 w-14 flex items-center justify-center rounded-2xl bg-blue-50 border border-blue-200 text-blue-600">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>

        {currentStep && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
            {currentStep}
          </div>
        )}

        {typeof progressPercent === "number" && (
          <div className="space-y-1.5">
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
            <p className="text-[11px] font-mono text-slate-500 text-right">{progressPercent}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

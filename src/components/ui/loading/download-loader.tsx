import React from "react";
import { Download, Loader2, CheckCircle2, AlertCircle, FileArchive } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DownloadLoaderProps {
  isOpen: boolean;
  title?: string;
  currentFileName?: string;
  completedFiles?: number;
  totalFiles?: number;
  percent?: number;
  statusText?: string;
  isComplete?: boolean;
  errorMessage?: string;
  onClose?: () => void;
  className?: string;
}

export function DownloadLoader({
  isOpen,
  title = "Preparing Download",
  currentFileName,
  completedFiles,
  totalFiles,
  percent = 0,
  statusText = "Downloading files and packaging archive...",
  isComplete = false,
  errorMessage,
  onClose,
  className,
}: DownloadLoaderProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className={cn(
          "w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200 text-center space-y-4",
          className
        )}
      >
        <div
          className={cn(
            "mx-auto h-14 w-14 flex items-center justify-center rounded-2xl border transition-colors",
            errorMessage
              ? "bg-rose-50 border-rose-200 text-rose-600"
              : isComplete
              ? "bg-emerald-50 border-emerald-200 text-emerald-600"
              : "bg-blue-50 border-blue-200 text-blue-600"
          )}
        >
          {errorMessage ? (
            <AlertCircle className="h-7 w-7" />
          ) : isComplete ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin" />
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {errorMessage ? errorMessage : isComplete ? "Download ready in your browser!" : statusText}
          </p>
        </div>

        {currentFileName && !isComplete && !errorMessage && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center gap-2 justify-center truncate">
            <FileArchive className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="truncate max-w-[240px] font-mono text-[11px]">{currentFileName}</span>
          </div>
        )}

        {typeof totalFiles === "number" && totalFiles > 0 && !isComplete && !errorMessage && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span>Packaging Files</span>
              <span>
                {completedFiles ?? 0} / {totalFiles} ({percent}%)
              </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
          </div>
        )}

        {(isComplete || errorMessage) && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-full h-9 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            {isComplete ? "Done" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}

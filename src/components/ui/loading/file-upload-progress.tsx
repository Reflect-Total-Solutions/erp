import React from "react";
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface FileUploadProgressProps {
  fileName: string;
  fileSize?: string;
  fileType?: "pdf" | "excel" | "word" | "image" | string;
  progressPercent: number; // 0 to 100
  stageText?: string;
  status?: "pending" | "uploading" | "processing" | "completed" | "error";
  errorMessage?: string;
  className?: string;
}

export function FileUploadProgress({
  fileName,
  fileSize,
  fileType = "pdf",
  progressPercent,
  stageText,
  status = "uploading",
  errorMessage,
  className,
}: FileUploadProgressProps) {
  const getFileIcon = () => {
    const lowerType = fileType.toLowerCase();
    if (lowerType.includes("excel") || lowerType.includes("xls")) {
      return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
    }
    if (lowerType.includes("image") || lowerType.includes("png") || lowerType.includes("jpg")) {
      return <ImageIcon className="h-5 w-5 text-blue-600" />;
    }
    if (lowerType.includes("word") || lowerType.includes("doc")) {
      return <FileText className="h-5 w-5 text-sky-600" />;
    }
    return <FileText className="h-5 w-5 text-rose-600" />;
  };

  const isCompleted = status === "completed" || progressPercent >= 100;
  const isError = status === "error" || Boolean(errorMessage);

  return (
    <div
      className={cn(
        "p-3 rounded-xl border transition-all text-xs",
        isError
          ? "bg-rose-50/60 border-rose-200 text-rose-900"
          : isCompleted
          ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
          : "bg-slate-50 border-slate-200 text-slate-800",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-white border border-slate-200 shrink-0">
            {getFileIcon()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate max-w-[220px] sm:max-w-xs" title={fileName}>
              {fileName}
            </p>
            {fileSize && <p className="text-[10px] text-slate-500 font-mono">{fileSize}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isError ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Failed
            </span>
          ) : isCompleted ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-blue-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progressPercent}%
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-300 rounded-full",
            isError
              ? "bg-rose-500"
              : isCompleted
              ? "bg-emerald-500"
              : "bg-blue-600"
          )}
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>

      {/* Stage or Error description */}
      <div className="flex items-center justify-between mt-1.5 text-[11px]">
        {isError ? (
          <p className="text-rose-600 font-medium truncate">{errorMessage || "Upload failed."}</p>
        ) : (
          <p className="text-slate-500 truncate">{stageText || (isCompleted ? "Saved to storage" : "Uploading...")}</p>
        )}
      </div>
    </div>
  );
}

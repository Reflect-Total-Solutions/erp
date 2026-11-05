import React from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GlobalPageLoaderProps {
  label?: string;
  sublabel?: string;
  className?: string;
  fullScreen?: boolean;
}

/**
 * Professional ERP page loader with brand logo and subtle animated glow.
 * Prevents blank screens during route navigation and server rendering.
 */
export function GlobalPageLoader({
  label = "Loading Reflect ERP...",
  sublabel = "Retrieving authorized company records...",
  className,
  fullScreen = false,
}: GlobalPageLoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center select-none",
        fullScreen ? "fixed inset-0 z-50 bg-[#F8FAFC]" : "min-h-[400px] w-full",
        className
      )}
    >
      <div className="relative flex flex-col items-center max-w-sm space-y-4">
        {/* Brand Logo Container */}
        <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-white shadow-sm border border-slate-200 p-2">
          <Image
            src="/logo.png"
            alt="Reflect Total Solutions"
            width={48}
            height={48}
            className="object-contain"
            priority
          />
        </div>

        {/* Spinner & Label */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">{label}</h3>
          </div>
          <p className="text-xs text-slate-500 font-medium">{sublabel}</p>
        </div>

        {/* Pulse Bar */}
        <div className="w-48 bg-slate-200/80 h-1 rounded-full overflow-hidden">
          <div className="bg-[#2563EB] h-full w-1/3 rounded-full animate-[shimmer_1.5s_infinite]" />
        </div>
      </div>
    </div>
  );
}

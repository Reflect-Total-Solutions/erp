import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonLoaderProps {
  isLoading: boolean;
  loadingText?: React.ReactNode;
  children: React.ReactNode;
  spinnerPlacement?: "start" | "end";
  className?: string;
  spinnerSize?: "sm" | "md";
}

/**
 * Renders an animated spinner and loading text when isLoading is true,
 * otherwise renders the standard children.
 */
export function ButtonLoader({
  isLoading,
  loadingText,
  children,
  spinnerPlacement = "start",
  className,
  spinnerSize = "sm",
}: ButtonLoaderProps) {
  if (!isLoading) {
    return <>{children}</>;
  }

  const spinner = (
    <Loader2
      className={cn(
        "animate-spin shrink-0",
        spinnerSize === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
      )}
    />
  );

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {spinnerPlacement === "start" && spinner}
      <span>{loadingText || children}</span>
      {spinnerPlacement === "end" && spinner}
    </span>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Slim top progress bar that animates when navigating between routes.
 * Provides immediate visual feedback during page transitions.
 */
export function NavigationProgressBar() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    // When pathname changes, briefly flash completion and then reset
    setIsNavigating(true);
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [pathname]);

  if (!isNavigating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent overflow-hidden pointer-events-none">
      <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 animate-[shimmer_1s_infinite] shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
    </div>
  );
}

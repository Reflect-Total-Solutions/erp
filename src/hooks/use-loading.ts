import { useState, useCallback } from "react";

export interface UseLoadingReturn {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  startLoading: () => void;
  stopLoading: () => void;
  withLoading: <T>(asyncFn: () => Promise<T>) => Promise<T>;
}

/**
 * Hook to manage loading state with safe try/finally execution.
 */
export function useLoading(initialState: boolean = false): UseLoadingReturn {
  const [isLoading, setIsLoading] = useState<boolean>(initialState);

  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);

  const withLoading = useCallback(
    async <T>(asyncFn: () => Promise<T>): Promise<T> => {
      setIsLoading(true);
      try {
        return await asyncFn();
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    setIsLoading,
    startLoading,
    stopLoading,
    withLoading,
  };
}

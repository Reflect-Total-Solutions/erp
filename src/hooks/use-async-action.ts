import { useState, useCallback, useRef } from "react";

export interface UseAsyncActionOptions<T, P extends any[]> {
  onSuccess?: (data: T, ...args: P) => void;
  onError?: (error: Error, ...args: P) => void;
  onSettled?: () => void;
}

export interface UseAsyncActionReturn<T, P extends any[]> {
  isLoading: boolean;
  error: Error | null;
  data: T | null;
  execute: (...args: P) => Promise<T | null>;
  reset: () => void;
}

/**
 * Hook to execute asynchronous tasks with safe concurrency locking,
 * error capturing, and state management.
 */
export function useAsyncAction<T = any, P extends any[] = any[]>(
  actionFn: (...args: P) => Promise<T>,
  options?: UseAsyncActionOptions<T, P>
): UseAsyncActionReturn<T, P> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const inFlightRef = useRef(false);

  const execute = useCallback(
    async (...args: P): Promise<T | null> => {
      // Prevent concurrent duplicate executions
      if (inFlightRef.current) {
        return null;
      }

      inFlightRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const result = await actionFn(...args);
        setData(result);
        options?.onSuccess?.(result, ...args);
        return result;
      } catch (err: any) {
        const parsedError = err instanceof Error ? err : new Error(String(err?.message || err));
        setError(parsedError);
        options?.onError?.(parsedError, ...args);
        return null;
      } finally {
        setIsLoading(false);
        inFlightRef.current = false;
        options?.onSettled?.();
      }
    },
    [actionFn, options]
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setData(null);
    inFlightRef.current = false;
  }, []);

  return {
    isLoading,
    error,
    data,
    execute,
    reset,
  };
}

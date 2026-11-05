import { useState, useEffect, useRef, useCallback } from "react";

export interface UseSearchDebounceOptions<T> {
  delay?: number;
  minQueryLength?: number;
  initialQuery?: string;
  onSearch: (query: string, signal?: AbortSignal) => Promise<T[]>;
}

export interface UseSearchDebounceReturn<T> {
  query: string;
  setQuery: (q: string) => void;
  results: T[];
  isSearching: boolean;
  error: string | null;
  clearSearch: () => void;
}

/**
 * Hook to provide debounced search queries with automatic race-condition cancellation.
 * Ensures older slow responses never overwrite newer search results.
 */
export function useSearchDebounce<T = any>({
  delay = 300,
  minQueryLength = 0,
  initialQuery = "",
  onSearch,
}: UseSearchDebounceOptions<T>): UseSearchDebounceReturn<T> {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<T[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsSearching(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (query.trim().length < minQueryLength) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const data = await onSearch(query.trim(), controller.signal);
        // Only update if this request is still the latest one
        if (currentSeq === requestSeqRef.current && !controller.signal.aborted) {
          setResults(data);
          setIsSearching(false);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        if (currentSeq === requestSeqRef.current) {
          setError(err?.message || "Search request failed");
          setIsSearching(false);
        }
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, delay, minQueryLength, onSearch]);

  return {
    query,
    setQuery,
    results,
    isSearching,
    error,
    clearSearch,
  };
}

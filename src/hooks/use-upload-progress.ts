import { useState, useCallback, useRef } from "react";

export interface UploadProgressState {
  isUploading: boolean;
  progressPercent: number; // 0 to 100
  bytesLoaded: number;
  bytesTotal: number;
  currentFileName: string;
  currentStage: string;
  error: string | null;
  isComplete: boolean;
}

export interface UseUploadProgressReturn extends UploadProgressState {
  uploadWithProgress: <T = any>(options: {
    url: string;
    method?: string;
    formData: FormData;
    fileName?: string;
    stage?: string;
    headers?: Record<string, string>;
  }) => Promise<T>;
  setProgressStage: (stage: string) => void;
  resetProgress: () => void;
}

/**
 * Hook to manage real file upload progress tracking using XMLHttpRequest.
 * Reports genuine bytes transferred and real processing status.
 */
export function useUploadProgress(): UseUploadProgressReturn {
  const [state, setState] = useState<UploadProgressState>({
    isUploading: false,
    progressPercent: 0,
    bytesLoaded: 0,
    bytesTotal: 0,
    currentFileName: "",
    currentStage: "",
    error: null,
    isComplete: false,
  });

  const activeXhrRef = useRef<XMLHttpRequest | null>(null);

  const setProgressStage = useCallback((stage: string) => {
    setState((prev) => ({ ...prev, currentStage: stage }));
  }, []);

  const resetProgress = useCallback(() => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      activeXhrRef.current = null;
    }
    setState({
      isUploading: false,
      progressPercent: 0,
      bytesLoaded: 0,
      bytesTotal: 0,
      currentFileName: "",
      currentStage: "",
      error: null,
      isComplete: false,
    });
  }, []);

  const uploadWithProgress = useCallback(
    <T = any>({
      url,
      method = "POST",
      formData,
      fileName = "",
      stage = "Uploading files...",
      headers = {},
    }: {
      url: string;
      method?: string;
      formData: FormData;
      fileName?: string;
      stage?: string;
      headers?: Record<string, string>;
    }): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        // Abort previous in-flight upload if any
        if (activeXhrRef.current) {
          activeXhrRef.current.abort();
        }

        const xhr = new XMLHttpRequest();
        activeXhrRef.current = xhr;

        setState({
          isUploading: true,
          progressPercent: 0,
          bytesLoaded: 0,
          bytesTotal: 0,
          currentFileName: fileName,
          currentStage: stage,
          error: null,
          isComplete: false,
        });

        // Track real byte progress
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
            setState((prev) => ({
              ...prev,
              progressPercent: percent,
              bytesLoaded: event.loaded,
              bytesTotal: event.total,
              currentStage: percent >= 100 ? "Processing on server..." : stage,
            }));
          }
        };

        xhr.onload = () => {
          activeXhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const responseData = JSON.parse(xhr.responseText);
              setState((prev) => ({
                ...prev,
                isUploading: false,
                progressPercent: 100,
                isComplete: true,
                currentStage: "Upload complete",
              }));
              resolve(responseData);
            } catch {
              resolve(xhr.responseText as any);
            }
          } else {
            let errorMsg = `Server returned status ${xhr.status}`;
            try {
              const errJson = JSON.parse(xhr.responseText);
              if (errJson?.error) errorMsg = errJson.error;
            } catch {
              // ignore
            }
            setState((prev) => ({
              ...prev,
              isUploading: false,
              error: errorMsg,
              currentStage: "Upload failed",
            }));
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          activeXhrRef.current = null;
          const errorMsg = "Network connection failed during upload.";
          setState((prev) => ({
            ...prev,
            isUploading: false,
            error: errorMsg,
            currentStage: "Network error",
          }));
          reject(new Error(errorMsg));
        };

        xhr.onabort = () => {
          activeXhrRef.current = null;
          setState((prev) => ({
            ...prev,
            isUploading: false,
            currentStage: "Upload cancelled",
          }));
          reject(new Error("Upload cancelled by user."));
        };

        xhr.open(method, url, true);
        Object.entries(headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
        xhr.send(formData);
      });
    },
    []
  );

  return {
    ...state,
    uploadWithProgress,
    setProgressStage,
    resetProgress,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";

// =============================================================================
// Types
// =============================================================================

export interface SSETask {
  name: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface SSELog {
  line: string;
  level: "info" | "error";
  timestamp: Date;
}

export interface SSEState {
  connected: boolean;
  progress: number;
  progressMessage: string;
  tasks: SSETask[];
  logs: SSELog[];
  completed: boolean;
  success: boolean;
  error: string | null;
  duration: number | null;
}

interface UseSSEOptions {
  onComplete?: (success: boolean, error?: string) => void;
}

interface UseSSEResult extends SSEState {
  connect: (operationId: string) => void;
  disconnect: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useSSE(options?: UseSSEOptions): UseSSEResult {
  const [state, setState] = useState<SSEState>({
    connected: false,
    progress: 0,
    progressMessage: "",
    tasks: [],
    logs: [],
    completed: false,
    success: false,
    error: null,
    duration: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setState((prev) => ({ ...prev, connected: false }));
    }
  }, []);

  const connect = useCallback(
    (operationId: string) => {
      // Close any existing connection
      disconnect();

      // Reset state
      setState({
        connected: true,
        progress: 0,
        progressMessage: "Starting...",
        tasks: [],
        logs: [],
        completed: false,
        success: false,
        error: null,
        duration: null,
      });

      const eventSource = new EventSource(`/api/operations/${operationId}/stream`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState((prev) => ({ ...prev, connected: true }));
      };

      eventSource.onerror = () => {
        setState((prev) => {
          // Don't set error if operation already completed successfully
          if (prev.completed) {
            return { ...prev, connected: false };
          }
          return {
            ...prev,
            connected: false,
            error: prev.error || "Connection lost",
          };
        });
      };

      // Handle progress events
      eventSource.addEventListener("progress", (event) => {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          progress: data.percent ?? prev.progress,
          progressMessage: data.message ?? prev.progressMessage,
        }));
      });

      // Handle task events
      eventSource.addEventListener("task", (event) => {
        const data = JSON.parse(event.data);
        setState((prev) => {
          const existingIndex = prev.tasks.findIndex((t) => t.name === data.name);
          const newTasks = [...prev.tasks];

          if (existingIndex >= 0) {
            newTasks[existingIndex] = { name: data.name, status: data.status };
          } else {
            newTasks.push({ name: data.name, status: data.status });
          }

          return { ...prev, tasks: newTasks };
        });
      });

      // Handle log events
      eventSource.addEventListener("log", (event) => {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          logs: [
            ...prev.logs,
            {
              line: data.line,
              level: data.level || "info",
              timestamp: new Date(),
            },
          ],
        }));
      });

      // Handle complete event
      eventSource.addEventListener("complete", (event) => {
        const data = JSON.parse(event.data);
        setState((prev) => ({
          ...prev,
          completed: true,
          success: data.success,
          error: data.error || null,
          duration: data.duration || null,
          progress: data.success ? 100 : prev.progress,
        }));

        // Close connection
        eventSource.close();
        eventSourceRef.current = null;

        // Call onComplete callback
        if (options?.onComplete) {
          options.onComplete(data.success, data.error);
        }
      });
    },
    [disconnect, options],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
  };
}

import { type ModuleInfo, fetchModules } from "@/ui/lib/api";
import { useCallback, useEffect, useState } from "react";

interface UseModulesResult {
  modules: ModuleInfo[];
  locked: boolean;
  lockMessage?: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useModules(category?: "targets" | "tools"): UseModulesResult {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [locked, setLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetchModules(category);

      // When locked, only show installed modules
      const filteredModules = response.data.locked
        ? response.data.modules.filter((m) => m.status !== "not_installed")
        : response.data.modules;

      setModules(filteredModules);
      setLocked(response.data.locked);
      setLockMessage(response.data.lockMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    modules,
    locked,
    lockMessage,
    isLoading,
    error,
    refetch,
  };
}

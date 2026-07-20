/**
 * Main Katana Dashboard App
 */

import { type ActiveOperation, ModuleCard } from "@/ui/components/ModuleCard";
import { OperationSheet } from "@/ui/components/OperationSheet";
import { SystemPanel } from "@/ui/components/SystemPanel";
import { SystemIcon, TargetsIcon, ToolsIcon } from "@/ui/components/icons/TabIcons";
import { Header } from "@/ui/components/layout/Header";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { Toaster } from "@/ui/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/components/ui/tabs";
import { useModules } from "@/ui/hooks/useModules";
import { useSSE } from "@/ui/hooks/useSSE";
import { useSystemStatus } from "@/ui/hooks/useSystemStatus";
import { startOperation } from "@/ui/lib/api";
import { useCallback, useState } from "react";
import { toast } from "sonner";

function ModuleGrid() {
  const { modules, locked, isLoading, error, refetch } = useModules("targets");
  const [operationOpen, setOperationOpen] = useState(false);
  const [currentModule, setCurrentModule] = useState("");
  const [currentOperation, setCurrentOperation] = useState<
    "install" | "remove" | "start" | "stop" | ""
  >("");
  const [completionPulse, setCompletionPulse] = useState<"success" | "error" | null>(null);

  const sse = useSSE({
    onComplete: (success) => {
      // NO TOAST - inline card feedback instead
      // Trigger pulse animation on the card
      setCompletionPulse(success ? "success" : "error");
      setTimeout(() => setCompletionPulse(null), 600);
      // Refresh modules list
      refetch();
    },
  });

  const handleOperation = useCallback(
    async (name: string, operation: "install" | "remove" | "start" | "stop") => {
      try {
        setCurrentModule(name);
        setCurrentOperation(operation);
        setCompletionPulse(null); // Reset any existing pulse
        // DON'T auto-open sheet - user can click card to see details

        const response = await startOperation(name, operation);
        sse.connect(response.data.operationId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // For startup errors, show toast since there's no card feedback yet
        toast.error(`Failed to start ${operation}: ${message}`);
      }
    },
    [sse],
  );

  const handleOpenDetails = useCallback(() => {
    setOperationOpen(true);
  }, []);

  // Build activeOperation object for cards
  const activeOperation: ActiveOperation | null =
    currentModule && currentOperation
      ? {
          moduleName: currentModule,
          operation: currentOperation as "install" | "remove" | "start" | "stop",
          progress: sse.progress,
          completed: sse.completed,
          success: sse.success,
          error: sse.error,
        }
      : null;

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error: {error}</p>
        <button
          type="button"
          className="mt-4 text-primary hover:underline"
          onClick={() => refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border rounded-xl p-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <ModuleCard
            key={module.name}
            module={module}
            locked={locked}
            activeOperation={activeOperation}
            completionPulse={module.name === currentModule ? completionPulse : null}
            onInstall={(name) => handleOperation(name, "install")}
            onRemove={(name) => handleOperation(name, "remove")}
            onStart={(name) => handleOperation(name, "start")}
            onStop={(name) => handleOperation(name, "stop")}
            onOpenDetails={handleOpenDetails}
          />
        ))}
      </div>

      {modules.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">No targets available</div>
      )}

      <OperationSheet
        open={operationOpen}
        onOpenChange={setOperationOpen}
        moduleName={currentModule}
        operation={currentOperation}
        progress={sse.progress}
        progressMessage={sse.progressMessage}
        tasks={sse.tasks}
        logs={sse.logs}
        completed={sse.completed}
        success={sse.success}
        error={sse.error}
        duration={sse.duration}
      />
    </>
  );
}

function ToolsList() {
  const { modules, isLoading, error } = useModules("tools");

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error: {error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="border rounded-xl p-6">
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const installedTools = modules.filter((m) => m.status !== "not_installed");

  if (installedTools.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No tools installed.</p>
        <p className="text-sm mt-2">Tools can be installed via the CLI:</p>
        <code className="mt-2 block bg-muted px-3 py-2 rounded text-sm">katana install zap</code>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {installedTools.map((tool) => (
        <div key={tool.name} className="border rounded-xl p-4 flex items-center justify-between">
          <div>
            <h3 className="font-medium">{tool.name}</h3>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
          </div>
          <span className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">
            Installed
          </span>
        </div>
      ))}
    </div>
  );
}

function SystemTab() {
  const { data, isLoading, error, refetch } = useSystemStatus();

  return <SystemPanel data={data} isLoading={isLoading} error={error} onRefresh={refetch} />;
}

export function App() {
  const { locked } = useModules("targets");

  return (
    <div className="min-h-screen bg-background">
      <Header locked={locked} />

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="targets">
          <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto mb-6">
            <TabsTrigger value="targets" className="flex items-center gap-2">
              <TargetsIcon className="h-4 w-4" />
              <span>Targets</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex items-center gap-2">
              <ToolsIcon className="h-4 w-4" />
              <span>Tools</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <SystemIcon className="h-4 w-4" />
              <span>System</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="targets">
            <ModuleGrid />
          </TabsContent>

          <TabsContent value="tools">
            <ToolsList />
          </TabsContent>

          <TabsContent value="system">
            <SystemTab />
          </TabsContent>
        </Tabs>
      </main>

      <Toaster position="bottom-right" />
    </div>
  );
}

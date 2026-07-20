import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/components/ui/collapsible";
import { Progress } from "@/ui/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/ui/components/ui/sheet";
import type { SSELog, SSETask } from "@/ui/hooks/useSSE";
import { CheckCircle2, ChevronDown, Circle, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";

interface OperationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleName: string;
  operation: string;
  progress: number;
  progressMessage: string;
  tasks: SSETask[];
  logs: SSELog[];
  completed: boolean;
  success: boolean;
  error: string | null;
  duration: number | null;
}

function TaskIcon({ status }: { status: SSETask["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function OperationSheet({
  open,
  onOpenChange,
  moduleName,
  operation,
  progress,
  progressMessage,
  tasks,
  logs,
  completed,
  success,
  error,
  duration,
}: OperationSheetProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs when new entries are added
  const logsLength = logs.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally triggering on logs.length
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logsLength]);

  const operationLabel = operation.charAt(0).toUpperCase() + operation.slice(1);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {completed ? (
              success ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
            {operationLabel} {moduleName}
          </SheetTitle>
          <SheetDescription>
            {completed
              ? success
                ? `Successfully ${operation}ed ${moduleName}`
                : `Failed to ${operation} ${moduleName}`
              : `${operationLabel}ing ${moduleName}...`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 p-4">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{progressMessage}</span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2">
            {completed && (
              <Badge variant={success ? "default" : "destructive"}>
                {success ? "Completed" : "Failed"}
              </Badge>
            )}
            {duration !== null && (
              <Badge variant="outline">Duration: {formatDuration(duration)}</Badge>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          {/* Tasks */}
          {tasks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Tasks</h4>
              <div className="space-y-1">
                {tasks.map((task) => (
                  <div key={task.name} className="flex items-center gap-2 text-sm">
                    <TaskIcon status={task.status} />
                    <span className={task.status === "pending" ? "text-muted-foreground" : ""}>
                      {task.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <Collapsible defaultOpen={!completed}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span>Logs ({logs.length})</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-md bg-muted p-3 font-mono text-xs">
                  {logs.map((log, index) => (
                    <div
                      key={`${log.timestamp.getTime()}-${index}`}
                      className={log.level === "error" ? "text-red-500" : "text-foreground"}
                    >
                      {log.line}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

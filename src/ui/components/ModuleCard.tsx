import { NinjaStarSpinner } from "@/ui/components/icons/NinjaStarSpinner";
import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/ui/components/ui/card";
import type { ModuleInfo, ModuleStatus } from "@/ui/lib/api";
import { Download, ExternalLink, Info, Play, Square, Trash2, XCircle } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

export interface ActiveOperation {
  moduleName: string;
  operation: "install" | "remove" | "start" | "stop";
  progress: number;
  completed: boolean;
  success: boolean;
  error: string | null;
}

interface ModuleCardProps {
  module: ModuleInfo;
  locked: boolean;
  activeOperation?: ActiveOperation | null;
  completionPulse?: "success" | "error" | null;
  onInstall: (name: string) => void;
  onRemove: (name: string) => void;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
  onOpenDetails?: () => void;
}

// =============================================================================
// Helper Components
// =============================================================================

/** Badge showing spinning ninja star + operation verb */
function OperationBadge({ operation }: { operation: string }) {
  const verb: Record<string, string> = {
    install: "Installing",
    remove: "Removing",
    start: "Starting",
    stop: "Stopping",
  };

  return (
    <Badge variant="secondary" className="gap-1.5">
      <NinjaStarSpinner spinning />
      <span>{verb[operation] || operation}...</span>
    </Badge>
  );
}

/** Thin progress bar at bottom of card */
function CardProgressBar({ progress }: { progress: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/10 rounded-b-xl overflow-hidden">
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// =============================================================================
// Status Helpers
// =============================================================================

function getStatusBadgeVariant(
  status: ModuleStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
      return "default";
    case "stopped":
      return "secondary";
    case "installed":
      return "secondary";
    case "not_installed":
      return "outline";
    default:
      return "outline";
  }
}

function getStatusLabel(status: ModuleStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "installed":
      return "Installed";
    case "not_installed":
      return "Not Installed";
    default:
      return "Unknown";
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function ModuleCard({
  module,
  locked,
  activeOperation,
  completionPulse,
  onInstall,
  onRemove,
  onStart,
  onStop,
  onOpenDetails,
}: ModuleCardProps) {
  const { name, description, status, hrefs } = module;

  // Check if this card has the active operation
  const isActive = activeOperation?.moduleName === name;
  const isOperating = isActive && !activeOperation?.completed;
  const hasError = isActive && activeOperation?.completed && !activeOperation?.success;

  // Derived state
  const isInstalled = status !== "not_installed";
  const isRunning = status === "running";
  const buttonsDisabled = locked || isOperating;

  // Determine which badge to show
  const renderBadge = () => {
    if (isOperating && activeOperation) {
      return <OperationBadge operation={activeOperation.operation} />;
    }
    if (hasError) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    }
    return <Badge variant={getStatusBadgeVariant(status)}>{getStatusLabel(status)}</Badge>;
  };

  // Build card className with animation
  const cardClasses = [
    "flex flex-col relative",
    completionPulse === "success" && "animate-pulse-success",
    completionPulse === "error" && "animate-pulse-error",
    isOperating && "cursor-pointer ring-1 ring-primary/20",
  ]
    .filter(Boolean)
    .join(" ");

  const handleCardClick = () => {
    if (isOperating && onOpenDetails) {
      onOpenDetails();
    }
  };

  return (
    <Card className={cardClasses} onClick={handleCardClick}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{name}</CardTitle>
          {renderBadge()}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        {/* Show links when running */}
        {isRunning && hrefs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {hrefs.map((href) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                {new URL(href).hostname}
              </a>
            ))}
          </div>
        )}

        {/* Show "click for details" hint when operating */}
        {isOperating && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            <span>Click for details</span>
          </div>
        )}

        {/* Show error hint when failed */}
        {hasError && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails?.();
            }}
            className="flex items-center gap-1.5 text-sm text-destructive hover:underline"
          >
            <Info className="h-3.5 w-3.5" />
            <span>Click to see error details</span>
          </button>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {!isInstalled && (
          <Button size="sm" onClick={() => onInstall(name)} disabled={buttonsDisabled}>
            <Download className="mr-1 h-4 w-4" />
            Install
          </Button>
        )}

        {isInstalled && !isRunning && (
          <>
            <Button size="sm" onClick={() => onStart(name)} disabled={isOperating}>
              <Play className="mr-1 h-4 w-4" />
              Start
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onRemove(name)}
              disabled={buttonsDisabled}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Remove
            </Button>
          </>
        )}

        {isRunning && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onStop(name)}
              disabled={isOperating}
            >
              <Square className="mr-1 h-4 w-4" />
              Stop
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onRemove(name)}
              disabled={buttonsDisabled}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Remove
            </Button>
          </>
        )}
      </CardFooter>

      {/* Progress bar at bottom when operating */}
      {isOperating && activeOperation && <CardProgressBar progress={activeOperation.progress} />}
    </Card>
  );
}

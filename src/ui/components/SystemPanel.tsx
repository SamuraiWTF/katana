import { Badge } from "@/ui/components/ui/badge";
import { Button } from "@/ui/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/components/ui/card";
import { Progress } from "@/ui/components/ui/progress";
import { Skeleton } from "@/ui/components/ui/skeleton";
import { type SystemStatus, getCACertUrl } from "@/ui/lib/api";
import { AlertCircle, CheckCircle2, Download, RefreshCw, XCircle } from "lucide-react";

interface SystemPanelProps {
  data: SystemStatus | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  );
}

function StatusItem({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {ok !== undefined && <StatusIcon ok={ok} />}
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}

export function SystemPanel({ data, isLoading, error, onRefresh }: SystemPanelProps) {
  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Status
            </CardTitle>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Prerequisites Card */}
        <Card>
          <CardHeader>
            <CardTitle>Prerequisites</CardTitle>
            <CardDescription>Required system components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusItem
              label="Docker"
              value={
                data.prerequisites.docker.installed
                  ? data.prerequisites.docker.version || "Installed"
                  : "Not found"
              }
              ok={data.prerequisites.docker.installed}
            />
            <StatusItem
              label="Daemon"
              value={data.prerequisites.docker.daemonRunning ? "Running" : "Stopped"}
              ok={data.prerequisites.docker.daemonRunning}
            />
            <StatusItem
              label="Permissions"
              value={data.prerequisites.docker.userCanConnect ? "OK" : "No access"}
              ok={data.prerequisites.docker.userCanConnect}
            />
          </CardContent>
        </Card>

        {/* System Resources Card */}
        <Card>
          <CardHeader>
            <CardTitle>System Resources</CardTitle>
            <CardDescription>
              {data.system.os} {data.system.kernel}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Memory</span>
                <span className="font-medium">
                  {formatBytes(data.system.memory.used)} / {formatBytes(data.system.memory.total)}
                </span>
              </div>
              <Progress value={data.system.memory.percentUsed} className="h-2" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Disk ({data.system.disk.path})</span>
                <span className="font-medium">
                  {formatBytes(data.system.disk.used)} / {formatBytes(data.system.disk.total)}
                </span>
              </div>
              <Progress value={data.system.disk.percentUsed} className="h-2" />
            </div>
            <StatusItem label="Uptime" value={data.system.uptime} />
          </CardContent>
        </Card>

        {/* Katana Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Katana Status</CardTitle>
            <CardDescription>Lab environment status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusItem
              label="Certificates"
              value={
                data.katana.certs.valid
                  ? data.katana.certs.daysUntilExpiration !== null
                    ? `Valid (${data.katana.certs.daysUntilExpiration}d)`
                    : "Valid"
                  : "Not initialized"
              }
              ok={data.katana.certs.valid}
            />
            <StatusItem
              label="Proxy"
              value={
                data.katana.proxy.running
                  ? `Running (${data.katana.proxy.routeCount} routes)`
                  : "Stopped"
              }
              ok={data.katana.proxy.running}
            />
            {data.katana.dns !== null && (
              <StatusItem
                label="DNS"
                value={
                  data.katana.dns.inSync
                    ? `In sync (${data.katana.dns.managedCount} entries)`
                    : `Out of sync (${data.katana.dns.managedCount}/${data.katana.dns.expectedCount})`
                }
                ok={data.katana.dns.inSync}
              />
            )}

            {data.katana.certs.valid && (
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href={getCACertUrl()} download="katana-ca.crt">
                    <Download className="mr-2 h-4 w-4" />
                    Download CA Certificate
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

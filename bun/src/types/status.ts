/**
 * Module status enum representing the lifecycle states of a module.
 */
export const ModuleStatus = {
	NOT_INSTALLED: "not_installed",
	INSTALLED: "installed",
	STOPPED: "stopped",
	RUNNING: "running",
	BLOCKED: "blocked",
	UNKNOWN: "unknown",
} as const;

export type ModuleStatus = (typeof ModuleStatus)[keyof typeof ModuleStatus];

/**
 * Check if a value is a valid ModuleStatus
 */
export function isModuleStatus(value: unknown): value is ModuleStatus {
	return typeof value === "string" && Object.values(ModuleStatus).includes(value as ModuleStatus);
}

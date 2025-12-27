import { z } from "zod";

// =============================================================================
// Task Parameter Schemas
// =============================================================================

/**
 * Service task - manage systemd services
 * Example: { name: "docker", state: "running" }
 */
export const ServiceParamsSchema = z.object({
	name: z.string().min(1),
	state: z.enum(["running", "stopped", "restarted"]),
});

export type ServiceParams = z.infer<typeof ServiceParamsSchema>;

/**
 * Docker task - manage Docker containers
 * Example: { name: "dvwa", image: "vulnerables/web-dvwa", ports: { "80/tcp": 31000 } }
 */
export const DockerParamsSchema = z.object({
	name: z.string().min(1),
	image: z.string().optional(),
	ports: z.record(z.string(), z.number().int().positive()).optional(),
});

export type DockerParams = z.infer<typeof DockerParamsSchema>;

/**
 * Lineinfile task - add/remove lines in files
 * Example: { dest: "/etc/hosts", line: "127.0.0.1 dvwa.test", state: "present" }
 */
export const LineinfileParamsSchema = z.object({
	dest: z.string().min(1),
	line: z.string(),
	state: z.enum(["present", "absent"]).default("present"),
});

export type LineinfileParams = z.infer<typeof LineinfileParamsSchema>;

/**
 * Reverseproxy task - manage nginx reverse proxy configs
 * Example: { hostname: "dvwa.test", proxy_pass: "http://localhost:31000" }
 */
export const ReverseproxyParamsSchema = z.object({
	hostname: z.string().min(1),
	proxy_pass: z.string().optional(),
});

export type ReverseproxyParams = z.infer<typeof ReverseproxyParamsSchema>;

/**
 * File task - create/remove directories
 * Example: { path: "/opt/samurai/burpsuite", state: "directory" }
 */
export const FileParamsSchema = z.object({
	path: z.string().min(1),
	state: z.enum(["directory", "absent"]),
});

export type FileParams = z.infer<typeof FileParamsSchema>;

/**
 * Copy task - write content to files
 * Example: { dest: "/usr/bin/burp", content: "#!/bin/bash\n...", mode: "0755" }
 * Note: mode must be a string to avoid YAML octal parsing issues
 */
export const CopyParamsSchema = z.object({
	dest: z.string().min(1),
	content: z.string(),
	mode: z
		.string()
		.regex(/^0?[0-7]{3,4}$/)
		.optional(),
});

export type CopyParams = z.infer<typeof CopyParamsSchema>;

/**
 * GetUrl task - download files from URLs
 * Example: { url: "https://example.com/file.jar", dest: "/opt/app/file.jar" }
 */
export const GetUrlParamsSchema = z.object({
	url: z.string().url(),
	dest: z.string().min(1),
});

export type GetUrlParams = z.infer<typeof GetUrlParamsSchema>;

/**
 * Git task - clone repositories
 * Example: { repo: "https://github.com/user/repo.git", dest: "/opt/repo" }
 */
export const GitParamsSchema = z.object({
	repo: z.string().url(),
	dest: z.string().min(1),
});

export type GitParams = z.infer<typeof GitParamsSchema>;

/**
 * Command task - run shell commands
 * Example: { cmd: "docker compose up -d", cwd: "/opt/app", shell: true }
 */
export const CommandParamsSchema = z.object({
	cmd: z.string().min(1),
	cwd: z.string().optional(),
	unsafe: z.boolean().optional(),
	shell: z.boolean().optional(),
});

export type CommandParams = z.infer<typeof CommandParamsSchema>;

/**
 * Replace task - regex-based text replacement in files
 * Example: { path: "/etc/config", regexp: "old_value", replace: "new_value" }
 */
export const ReplaceParamsSchema = z.object({
	path: z.string().min(1),
	regexp: z.string().min(1),
	replace: z.string(),
});

export type ReplaceParams = z.infer<typeof ReplaceParamsSchema>;

/**
 * Rm task - remove files or directories
 * Example: { path: "/tmp/old-file" } or { path: ["/tmp/a", "/tmp/b"] }
 */
export const RmParamsSchema = z.object({
	path: z.union([z.string().min(1), z.array(z.string().min(1))]),
});

export type RmParams = z.infer<typeof RmParamsSchema>;

/**
 * Unarchive task - download and extract tar.gz files
 * Example: { url: "https://example.com/app.tar.gz", dest: "/opt/app", cleanup: true }
 */
export const UnarchiveParamsSchema = z.object({
	url: z.string().url(),
	dest: z.string().min(1),
	cleanup: z.boolean().optional(),
});

export type UnarchiveParams = z.infer<typeof UnarchiveParamsSchema>;

/**
 * Desktop file configuration for DesktopIntegration plugin
 */
export const DesktopFileSchema = z.object({
	filename: z.string().min(1),
	content: z.string(),
	add_to_favorites: z.boolean().optional(),
});

export type DesktopFile = z.infer<typeof DesktopFileSchema>;

/**
 * Desktop task - manage desktop integration (menu items, favorites)
 * For install: { desktop_file: { filename, content, add_to_favorites } }
 * For remove: { filename: "app.desktop" }
 */
export const DesktopParamsSchema = z.object({
	desktop_file: DesktopFileSchema.optional(),
	filename: z.string().optional(),
});

export type DesktopParams = z.infer<typeof DesktopParamsSchema>;

// =============================================================================
// Task Schema (discriminated by action key)
// =============================================================================

/**
 * Base task fields shared by all task types
 */
const TaskBaseSchema = z.object({
	/** Optional human-readable description of this task */
	name: z.string().optional(),
});

/**
 * Individual task schemas with their action key
 */
export const ServiceTaskSchema = TaskBaseSchema.extend({
	service: ServiceParamsSchema,
});

export const DockerTaskSchema = TaskBaseSchema.extend({
	docker: DockerParamsSchema,
});

export const LineinfileTaskSchema = TaskBaseSchema.extend({
	lineinfile: LineinfileParamsSchema,
});

export const ReverseproxyTaskSchema = TaskBaseSchema.extend({
	reverseproxy: ReverseproxyParamsSchema,
});

export const FileTaskSchema = TaskBaseSchema.extend({
	file: FileParamsSchema,
});

export const CopyTaskSchema = TaskBaseSchema.extend({
	copy: CopyParamsSchema,
});

export const GetUrlTaskSchema = TaskBaseSchema.extend({
	get_url: GetUrlParamsSchema,
});

export const GitTaskSchema = TaskBaseSchema.extend({
	git: GitParamsSchema,
});

export const CommandTaskSchema = TaskBaseSchema.extend({
	command: CommandParamsSchema,
});

export const ReplaceTaskSchema = TaskBaseSchema.extend({
	replace: ReplaceParamsSchema,
});

export const RmTaskSchema = TaskBaseSchema.extend({
	rm: RmParamsSchema,
});

export const UnarchiveTaskSchema = TaskBaseSchema.extend({
	unarchive: UnarchiveParamsSchema,
});

export const DesktopTaskSchema = TaskBaseSchema.extend({
	desktop: DesktopParamsSchema,
});

/**
 * Union of all task types
 * Each task has an optional `name` field plus exactly one action key
 */
export const TaskSchema = z.union([
	ServiceTaskSchema,
	DockerTaskSchema,
	LineinfileTaskSchema,
	ReverseproxyTaskSchema,
	FileTaskSchema,
	CopyTaskSchema,
	GetUrlTaskSchema,
	GitTaskSchema,
	CommandTaskSchema,
	ReplaceTaskSchema,
	RmTaskSchema,
	UnarchiveTaskSchema,
	DesktopTaskSchema,
]);

export type Task = z.infer<typeof TaskSchema>;

// =============================================================================
// Status Check Schemas
// =============================================================================

/**
 * Exists check - verify resource existence for status.installed.exists
 * Example: { docker: "dvwa" } or { path: "/opt/app" } or { service: "nginx" }
 */
export const ExistsCheckSchema = z.object({
	docker: z.string().optional(),
	path: z.string().optional(),
	service: z.string().optional(),
});

export type ExistsCheck = z.infer<typeof ExistsCheckSchema>;

/**
 * Started check - verify resource is running for status.running.started
 * Example: { docker: "dvwa" } or { service: "nginx" }
 */
export const StartedCheckSchema = z.object({
	docker: z.string().optional(),
	service: z.string().optional(),
});

export type StartedCheck = z.infer<typeof StartedCheckSchema>;

/**
 * Status section schema
 * Example:
 * status:
 *   running:
 *     started:
 *       docker: dvwa
 *   installed:
 *     exists:
 *       docker: dvwa
 */
export const StatusSchema = z.object({
	running: z
		.object({
			started: StartedCheckSchema,
		})
		.optional(),
	installed: z
		.object({
			exists: ExistsCheckSchema,
		})
		.optional(),
});

export type Status = z.infer<typeof StatusSchema>;

// =============================================================================
// Module Schema
// =============================================================================

/**
 * Module categories
 */
export const ModuleCategory = z.enum(["targets", "tools", "base", "management"]);

export type ModuleCategory = z.infer<typeof ModuleCategory>;

/**
 * Complete module YAML schema
 *
 * Example module:
 * ```yaml
 * name: dvwa
 * category: targets
 * description: A classic test lab focused on OWASP top 10 vulnerabilities.
 * href: https://dvwa.test:8443
 *
 * install:
 *   - service:
 *       name: docker
 *       state: running
 *   - docker:
 *       name: dvwa
 *       image: vulnerables/web-dvwa
 *       ports:
 *         80/tcp: 31000
 *
 * status:
 *   running:
 *     started:
 *       docker: dvwa
 *   installed:
 *     exists:
 *       docker: dvwa
 * ```
 */
export const ModuleSchema = z.object({
	/** Unique identifier for the module */
	name: z.string().min(1),
	/** Category grouping */
	category: ModuleCategory,
	/** Human-readable description */
	description: z.string().optional(),
	/** URL to access the module when running (for targets) */
	href: z.string().url().optional(),
	/** Tasks to run when installing the module */
	install: z.array(TaskSchema).optional(),
	/** Tasks to run when removing the module */
	remove: z.array(TaskSchema).optional(),
	/** Tasks to run when starting the module */
	start: z.array(TaskSchema).optional(),
	/** Tasks to run when stopping the module */
	stop: z.array(TaskSchema).optional(),
	/** Status checks to determine module state */
	status: StatusSchema.optional(),
});

export type Module = z.infer<typeof ModuleSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Parse and validate a module object
 * Returns the validated module or throws a ZodError with human-readable messages
 */
export function parseModule(data: unknown): Module {
	return ModuleSchema.parse(data);
}

/**
 * Safely parse a module, returning success/error result
 */
export function safeParseModule(data: unknown): ReturnType<typeof ModuleSchema.safeParse> {
	return ModuleSchema.safeParse(data);
}

/**
 * Get a human-readable error message from a Zod error
 */
export function formatModuleError(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.join(".");
			return path ? `${path}: ${issue.message}` : issue.message;
		})
		.join("\n");
}

// Module status

// Module loader types (re-exported for convenience)
export type {
	LoadedModule,
	ModuleLoadError,
	ModuleLoaderOptions,
	ModuleLoaderResult,
	ModuleLoadResult,
} from "../core/module-loader";
// State manager
export {
	getStateManager,
	type LockOptions,
	StateManager,
	type StateManagerOptions,
} from "../core/state-manager";
// Configuration
export {
	CONFIG_PATHS,
	type Config,
	ConfigSchema,
	DEFAULT_CONFIG,
	type LogConfig,
	LogConfigSchema,
	type ServerConfig,
	ServerConfigSchema,
} from "./config";
// SSE events
export {
	type CompleteEvent,
	CompleteEventSchema,
	type ErrorEvent,
	ErrorEventSchema,
	formatSSEMessage,
	type LogEvent,
	LogEventSchema,
	type ProgressEvent,
	ProgressEventSchema,
	type SSEEvent,
	SSEEventSchema,
	SSEEventType,
	type StatusEvent,
	StatusEventSchema,
} from "./events";
// Module YAML schema
export {
	type CommandParams,
	CommandParamsSchema,
	CommandTaskSchema,
	type CopyParams,
	CopyParamsSchema,
	CopyTaskSchema,
	type DesktopFile,
	DesktopFileSchema,
	type DesktopParams,
	DesktopParamsSchema,
	DesktopTaskSchema,
	type DockerParams,
	DockerParamsSchema,
	DockerTaskSchema,
	type ExistsCheck,
	// Status schemas
	ExistsCheckSchema,
	type FileParams,
	FileParamsSchema,
	FileTaskSchema,
	formatModuleError,
	type GetUrlParams,
	GetUrlParamsSchema,
	GetUrlTaskSchema,
	type GitParams,
	GitParamsSchema,
	GitTaskSchema,
	type LineinfileParams,
	LineinfileParamsSchema,
	LineinfileTaskSchema,
	type Module,
	// Module schema
	ModuleCategory,
	ModuleSchema,
	// Helpers
	parseModule,
	type ReplaceParams,
	ReplaceParamsSchema,
	ReplaceTaskSchema,
	type ReverseproxyParams,
	ReverseproxyParamsSchema,
	ReverseproxyTaskSchema,
	type RmParams,
	RmParamsSchema,
	RmTaskSchema,
	// Types
	type ServiceParams,
	// Task parameter schemas
	ServiceParamsSchema,
	// Task schemas
	ServiceTaskSchema,
	type StartedCheck,
	StartedCheckSchema,
	type Status,
	StatusSchema,
	safeParseModule,
	type Task,
	TaskSchema,
	type UnarchiveParams,
	UnarchiveParamsSchema,
	UnarchiveTaskSchema,
} from "./module";
// Plugin types
export {
	BasePlugin,
	type ExecutionContext,
	type IPlugin,
	type Logger,
	type PluginResult,
	PluginResultSchema,
} from "./plugin";
// State files
export {
	EMPTY_INSTALLED_STATE,
	EMPTY_LOCK_STATE,
	type InstalledModule,
	InstalledModuleSchema,
	type InstalledState,
	InstalledStateSchema,
	LockFileLegacySchema,
	type LockFileYaml,
	LockFileYamlSchema,
	type LockState,
} from "./state";
export { isModuleStatus, ModuleStatus } from "./status";

/**
 * Plugin system exports.
 */

// Registry
export { PluginRegistry, getPluginRegistry } from "./registry";

// Individual plugins
export { DockerPlugin } from "./docker";
export { ServicePlugin } from "./service";
export { LineinfilePlugin } from "./lineinfile";
export { ReverseproxyPlugin } from "./reverseproxy";
export { FilePlugin } from "./file";
export { CopyPlugin } from "./copy";
export { GitPlugin } from "./git";
export { CommandPlugin } from "./command";
export { RmPlugin } from "./rm";
export { GetUrlPlugin } from "./get-url";
export { UnarchivePlugin } from "./unarchive";
export { ReplacePlugin } from "./replace";
export { DesktopPlugin } from "./desktop";

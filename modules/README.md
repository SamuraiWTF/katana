# Overview of Samurai Modules

Samurai Modules are the tools and targets that can be installed and used on the Samurai Web Testing Framework. A *Tool Module* is a binary or library that can be installed, uninstalled, and possibly executed. A *Target Module* is different in that it behaves like a service. It can be started, stopped, restarted, and has a run status.

## Assigned Ports
To avoid conflict with other tools and targets, any new modules should run on local ports that have not been assigned to other modules.

|   *Port* | *Module*      | *Purpose*                         |
|---------:|---------------|-----------------------------------|
| 0 - 1023 | none          | Ports reserved by the host system |
|     7000 | wayfarer      | application                       |
|     7001 | wayfarer      | api                               |
|     8087 | katana        | katana UI                         |    
|     8443 | none          | SamuraiWTF TLS Port               |
|    30080 | samurai-dojo  | dojo-basic                        |
|    31080 | samurai-dojo  | dojo-scavenger                    |

*Ports reserved by the host system
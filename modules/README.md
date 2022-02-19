# Overview of Samurai Modules

Samurai Modules are the tools and targets that can be installed and used on the Samurai Web Testing Framework. A *Tool Module* is a binary or library that can be installed, uninstalled, and possibly executed. A *Target Module* is different in that it behaves like a service. It can be started, stopped, restarted, and has a run status.

## Assigned Ports
To avoid conflict with other tools and targets, any new modules should run on local ports that have not been assigned to other modules.

|   *Port* | *Module*             |
|---------:|----------------------|
| 0 - 1023 | System ports*        |
|     8087 | Katana UI            |    
|     8443 | SamuraiWTF TLS Port* |

*Ports reserved by the host system
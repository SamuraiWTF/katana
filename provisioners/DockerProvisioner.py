from provisioners import DefaultProvisioner
import katanacore
import katanaerrors


class DockerProvisioner(DefaultProvisioner.DefaultProvisioner):
    def __init__(self, module_info):
        super(DockerProvisioner, self).__init__(module_info)
        self.action_list = ['stop', 'start', 'install', 'remove']

    def get_dependencies(self):
        return

    def install(self):
        if katanacore.status_module('docker') == 'not installed':
            katanacore.install_module('docker')
        if katanacore.status_module('docker') != 'running':
            katanacore.start_module('docker')

        ports = {}
        for port in self.module_info.get('container', {}).get('ports', []):
            ports['{}/tcp'.format(port.get('guest'))] = int(port.get('host', 80))

        func = [
            {
                'name': 'Get latest release of {}'.format(self.module_info['name']),
                'git': {
                    'repo': self.module_info.get('source').get('git-repo'),
                    'dest': self.module_info.get('destination')
                }
            },
            {
                'name': 'Install the docker image',
                'docker': {
                    'name': self.module_info.get('container').get('name'),
                    'image': self.module_info.get('container').get('image', '{}'.format(
                        self.module_info.get('container').get('name'))),
                    'path': self.module_info.get('destination'),
                    'ports': ports
                }
            },
            {
                'name': 'Setup hosts file entry',
                'lineinfile': {
                    'dest': '/etc/hosts',
                    'line': '127.0.0.1   {}'.format(self.module_info.get('hosting', {}).get('domain'))
                }
            },
            {
                'name': 'Setup nginx reverse-proxy config',
                'copy': {
                    'dest': '/etc/nginx/conf.d/{}.conf'.format(self.module_info.get('name')),
                    'content': f'server {{\n'
                               f'  listen {self.module_info.get("hosting").get("http").get("listen")};\n'
                               f'  server_name {self.module_info.get("hosting").get("domain")};\n'
                               f'  location / {{\n'
                               f'    proxy_pass {self.module_info.get("hosting").get("http").get("proxy-pass")};\n'
                               f'  }}\n'
                               f'}}',
                    'mode': 774
                }
            },
            {
                'name': 'Restart nginx',
                'service': {
                    'name': 'nginx',
                    'state': 'restarted'
                }
            }
        ]

        for task in func:
            self._run_task(task, "install")

    def remove(self):
        if katanacore.status_module('docker') != 'running':
            katanacore.start_module('docker')
        func = [
            {
                'name': 'Remove docker container.',
                'docker': {
                    'name': self.module_info.get('container').get('name'),
                }
            },
            {
                'name': 'Remove hosts file entry.',
                'lineinfile': {
                    'dest': '/etc/hosts',
                    'line': '127.0.0.1   {}'.format(self.module_info.get('hosting', {}).get('domain')),
                    'state': 'absent'
                }
            },
            {
                'name': 'Remove nginx config.',
                'rm': {
                    'path': '/etc/nginx/conf.d/{}.conf'.format(self.module_info.get('name'))
                }
            }
        ]

        for task in func:
            self._run_task(task, "remove")

    def start(self):
        if katanacore.status_module('docker') != 'running':
            katanacore.start_module('docker')
        self._run_task({'docker': {'name': self.module_info.get('container').get('name')}}, 'start')

    def stop(self):
        if katanacore.status_module('docker') != 'running':
            katanacore.start_module('docker')
        self._run_task({'docker': {'name': self.module_info.get('container').get('name')}}, 'stop')

# docker build -t plugin-lab . && docker run -p 127.0.0.1:8081:3000 plugin-lab

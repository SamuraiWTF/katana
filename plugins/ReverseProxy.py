import os

from plugins import Plugin


class ReverseProxy(Plugin):
    '''
        module: reverseproxy
        options:
            hostname:
                type: str
                description:
                    - the hostname as exposed by the reverse proxy. The URL will be https://<hostname>:8443
            proxy_pass:
                type: str
                description:
                    - The (internal) url to be proxied. This will typically be http://localhost:<port>
        '''

    @classmethod
    def get_aliases(cls):
        return ["reverseproxy"]

    def install(self, params):
        self._validate_params(params, ['hostname', 'proxy_pass'], 'reverseproxy')
        # 1. Check if the key, csr and crt (certificate) files are already created
        hostname = params.get('hostname')
        base_path = '/etc/samurai.d/certs/{hostname}'.format(hostname=hostname)
        files_in_place = True
        for suffix in ['key', 'csr', 'crt', 'ext']:
            files_in_place = files_in_place and os.path.exists('{}.{}'.format(base_path, suffix))

        #   --> If any are missing, create them.  Use hostname as the name.
        if not files_in_place:
            self._run_command('openssl req -new -newkey rsa:4096 -nodes -keyout {hostname}.key -out {hostname}.csr -subj "/C=US/ST=Hacking/L=Springfield/O=SamuraiWTF/CN={hostname}"'.format(
                                hostname=hostname), cwd='/etc/samurai.d/certs/')

            ext_lines = [
                'authorityKeyIdentifier = keyid, issuer\n',
                'basicConstraints = CA:FALSE\n',
                'keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment\n',
                'subjectAltName = @alt_names\n\n',
                '[alt_names]\n',
                'DNS.1 = {hostname}\n'.format(hostname=hostname)
            ]
            ext_file = open('/etc/samurai.d/certs/{hostname}.ext'.format(hostname=hostname), 'w')
            ext_file.writelines(ext_lines)
            ext_file.close()

            self._run_command('openssl x509 -req -in {hostname}.csr -CA rootCACert.pem -CAkey rootCAKey.pem -CAcreateserial -out {hostname}.crt -days 365-sha256 -extfile {hostname}.ext'.format(hostname=params.get('hostname')), cwd='/etc/samurai.d/certs/')

        nginx_conf_lines = [
            'server {\n',
            '  listen 80;\n',
            '  server_name {hostname};\n'.format(hostname=hostname),
            '  return 301 https://{hostname}:8443$request_uri;\n'.format(hostname=hostname),
            '}\n',
            'server {\n',
            '  listen 8443 ssl;\n',
            '  server_name {hostname};\n'.format(hostname=hostname),
            '  location / {\n',
            '    proxy_pass {proxypass};\n'.format(proxypass=params.get('proxy_pass')),
            '  }\n',
            '  ssl_certificate /etc/samurai.d/certs/{hostname}.crt;\n'.format(hostname=hostname),
            '  ssl_certificate_key /etc/samurai.d/certs/{hostname}.key;\n'.format(hostname=hostname),
            '}\n'
            ]

        nginx_conf_file = open('/etc/nginx/conf.d/{hostname}.conf'.format(hostname=hostname), 'w')
        nginx_conf_file.writelines(nginx_conf_lines)
        nginx_conf_file.close()
        os.chmod('/etc/nginx/conf.d/{hostname}.conf'.format(hostname=hostname), 644)

        return True, None

#!/bin/bash -e

yum install -y yum-utils

if ! command -v docker; then
  yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  usermod -a -G docker vagrant
fi

yum install -y python3-pip git jq java-17-openjdk-headless nginx
systemctl enable nginx
systemctl start nginx

mkdir -p /etc/samurai.d/{certs,applications}/ /opt/katana

wget $(curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest | jq -r ".assets[] | select(.name | test(\"linux-amd64\")) | .browser_download_url") -O mkcert
chmod +x ./mkcert
mv ./mkcert /usr/local/bin/mkcert
openssl genrsa -out /etc/samurai.d/certs/rootCAKey.pem 2048
openssl req -x509 -sha256 -new -nodes -key /etc/samurai.d/certs/rootCAKey.pem -days 365 -out /etc/samurai.d/certs/rootCACert.pem -subj "/C=US/ST=Hacking/L=Springfield/O=SamuraiWTF/CN=samuraiwtf"
cp /etc/samurai.d/certs/rootCACert.pem /etc/pki/ca-trust/source/anchors/
update-ca-trust
openssl req -new -newkey rsa:4096 -nodes -keyout /etc/samurai.d/certs/katana.test.key -out /etc/samurai.d/certs/katana.test.csr -subj "/C=US/ST=Hacking/L=Springfield/O=SamuraiWTF/CN=katana.test"

pip3 install -r requirements.txt
cat > /usr/bin/katana <<EOF
#!/bin/bash -e
[[ -s katanacli.py ]] || cd /opt/katana
sudo python3 ./katanacli.py "\$@"
EOF
chmod 0755 /usr/bin/katana

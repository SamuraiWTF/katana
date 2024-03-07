#!/bin/bash -e

apt-get update
apt-get install -y ca-certificates curl

if ! command -v docker; then
  # https://docs.docker.com/engine/install/ubuntu/
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # Add the repository to Apt sources:
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  if [[ ! -x /usr/bin/docker-compose ]]; then
    cat <<EOF > /usr/bin/docker-compose
#!/bin/bash
exec docker compose "\$@"
EOF
    chmod +x /usr/bin/docker-compose
  fi

  systemctl enable docker
  systemctl start docker
  usermod -a -G docker vagrant
fi

apt-get install -y python3-pip git jq openjdk-17-jdk-headless nginx yarnpkg
ln -sf /usr/bin/yarnpkg /usr/bin/yarn
systemctl enable nginx
systemctl start nginx

mkdir -p /etc/samurai.d/{certs,applications}/ /opt/katana

wget $(curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest | jq -r ".assets[] | select(.name | test(\"linux-amd64\")) | .browser_download_url") -O mkcert
chmod +x ./mkcert
mv ./mkcert /usr/local/bin/mkcert
openssl genrsa -out /etc/samurai.d/certs/rootCAKey.pem 2048
openssl req -x509 -sha256 -new -nodes -key /etc/samurai.d/certs/rootCAKey.pem -days 365 -out /etc/samurai.d/certs/rootCACert.pem -subj "/C=US/ST=Hacking/L=Springfield/O=SamuraiWTF/CN=samuraiwtf"
cp /etc/samurai.d/certs/rootCACert.pem /etc/ssl/certs
update-ca-certificates
openssl req -new -newkey rsa:4096 -nodes -keyout /etc/samurai.d/certs/katana.test.key -out /etc/samurai.d/certs/katana.test.csr -subj "/C=US/ST=Hacking/L=Springfield/O=SamuraiWTF/CN=katana.test"

pip3 install -r requirements.txt
cat > /usr/bin/katana <<EOF
#!/bin/bash -e
[[ -s katanacli.py ]] || cd /opt/katana
sudo python3 ./katanacli.py "\$@"
EOF
chmod 0755 /usr/bin/katana

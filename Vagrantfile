# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  # Ubuntu Desktop box
  config.vm.box = "gusztavvargadr/ubuntu-desktop"

  # VMware-specific configuration
  config.vm.provider "vmware_desktop" do |v|
    v.vmx["memsize"] = "4096"
    v.vmx["numvcpus"] = "2"
    v.gui = true
  end

  # Port forwarding for Katana proxy
  config.vm.network "forwarded_port", guest: 443, host: 8443, host_ip: "127.0.0.1"

  # Sync the project directory with exclusions
  config.vm.synced_folder ".", "/home/vagrant/katana", type: "rsync",
    rsync__exclude: [
      ".git/",
      "bin/",
      "node_modules/",
      ".vagrant/",
      ".DS_Store",
      "src/ui/embedded-assets.ts"
    ],
    rsync__auto: true

  # Provisioning script
  config.vm.provision "shell", inline: <<-SHELL
    set -e

    echo "==> Installing system dependencies..."
    apt-get update
    apt-get install -y curl unzip

    echo "==> Installing Docker..."
    # Install Docker if not already installed
    if ! command -v docker &> /dev/null; then
      curl -fsSL https://get.docker.com -o get-docker.sh
      sh get-docker.sh
      rm get-docker.sh
      usermod -aG docker vagrant
    fi

    echo "==> Installing Bun..."
    # Install Bun as vagrant user
    su - vagrant -c 'curl -fsSL https://bun.sh/install | bash'

    echo "==> Creating Docker network..."
    docker network create katana-net 2>/dev/null || true

    echo "==> Setting up Katana directories..."
    su - vagrant -c 'mkdir -p ~/.config/katana ~/.local/share/katana'

    echo "==> Creating katana symlink in PATH..."
    # Create symlink so 'katana' command works from anywhere
    # Note: The target doesn't need to exist yet - symlink will work once binary is built
    mkdir -p /home/vagrant/katana/bin
    ln -sf /home/vagrant/katana/bin/katana /usr/local/bin/katana
    chown vagrant:vagrant /home/vagrant/katana/bin

    echo ""
    echo "==> VM provisioning complete!"
    echo ""
    echo "Next steps:"
    echo "  1. vagrant ssh"
    echo "  2. cd katana"
    echo "  3. bun install"
    echo "  4. bun run build:ui && bun run build"
    echo "  5. sudo katana setup-proxy"
    echo "  6. katana cert init"
    echo "  7. sudo katana dns sync --all"
    echo "  8. katana doctor"
    echo ""
    echo "Development workflow:"
    echo "  - Edit files on Windows (your IDE)"
    echo "  - Run 'vagrant rsync-auto' in separate terminal to auto-sync changes"
    echo "  - Build/test in VM via 'vagrant ssh'"
    echo ""
  SHELL
end

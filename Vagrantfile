# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vagrant.plugins = []
  config.vm.box = "bento/ubuntu-22.04"
  config.vm.synced_folder ".", "/opt/katana"
  config.vm.provider "virtualbox" do |vb|
    config.vagrant.plugins.append("vagrant-vbguest")
    vb.gui = false
    vb.memory = "1024"
  end
  config.vm.provision "shell", name: "setup", path: "test/provision-ubuntu.sh", env: { 'DEBIAN_FRONTEND': 'noninteractive'}
end

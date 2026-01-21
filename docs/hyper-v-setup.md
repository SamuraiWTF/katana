# Hyper-V Ubuntu Desktop Setup for Katana Testing

This guide walks through setting up Ubuntu Desktop on Hyper-V for local Katana development and testing.

## Step 1: Download Ubuntu Desktop ISO

1. Go to https://ubuntu.com/download/desktop
2. Download **Ubuntu 24.04 LTS Desktop** (or 22.04 LTS if preferred)
3. Save the ISO file (approximately 5-6 GB)

## Step 2: Create Hyper-V Virtual Machine

### Open Hyper-V Manager
- Press Windows key, type "Hyper-V Manager", and open it
- If you don't see it, you may need to enable Hyper-V feature in Windows Features

### Create New Virtual Machine
1. In Hyper-V Manager, click **Action → New → Virtual Machine**
2. Click **Next** on the welcome screen

### Configure the VM:

**Specify Name and Location:**
- Name: `Katana-Ubuntu-Test` (or whatever you prefer)
- Click **Next**

**Specify Generation:**
- Select **Generation 2** (required for Ubuntu)
- Click **Next**

**Assign Memory:**
- Startup memory: `4096` MB (4 GB minimum, 8 GB better if you have RAM to spare)
- Check **Use Dynamic Memory**
- Click **Next**

**Configure Networking:**
- Connection: Select **Default Switch** (this gives the VM internet access and makes it reachable from Windows)
- Click **Next**

**Connect Virtual Hard Disk:**
- Create a virtual hard disk
- Name: `Katana-Ubuntu-Test.vhdx`
- Size: `50` GB (minimum)
- Click **Next**

**Installation Options:**
- Select **Install an operating system from a bootable image file**
- Click **Browse** and select the Ubuntu ISO you downloaded
- Click **Next**

**Finish:**
- Review your settings
- Click **Finish**

### Configure VM Settings (Before First Boot)

1. Right-click your new VM → **Settings**

2. **Security** (left sidebar):
   - **UNCHECK** "Enable Secure Boot"
   - (Ubuntu can work with Secure Boot, but disabling avoids potential issues)
   - Click **OK**

3. **Processor** (left sidebar):
   - Number of virtual processors: `2` (or more if available)

4. Click **OK**

## Step 3: Install Ubuntu Desktop

1. In Hyper-V Manager, double-click your VM (or right-click → **Connect**)
2. Click **Start** in the VM window
3. Ubuntu installer will boot

### Installation Steps:
1. Select language → **English** → **Install Ubuntu**
2. Keyboard layout → **English (US)** → **Continue**
3. Updates and other software:
   - Select **Normal installation**
   - Check **Download updates while installing Ubuntu**
   - Check **Install third-party software** (for better hardware support)
   - **Continue**
4. Installation type → **Erase disk and install Ubuntu** → **Install Now** → **Continue**
   - (Don't worry, this only affects the virtual disk, not your Windows machine)
5. Time zone → Select your timezone → **Continue**
6. Create your user:
   - Your name: (your name)
   - Computer name: `katana-test` (or whatever you prefer)
   - Username: (your username)
   - Password: (choose a password)
   - **Continue**
7. Wait for installation (10-15 minutes)
8. Click **Restart Now**
9. Press Enter when prompted to remove installation medium
10. VM will reboot into Ubuntu

### Initial Ubuntu Setup:
1. Log in with your password
2. Click through the "What's New" screens
3. Skip Ubuntu Pro setup (or sign up if you want)
4. Skip sending system info
5. You now have Ubuntu Desktop running!

## Step 4: Enable Enhanced Session Mode (Better Display/Clipboard)

Enhanced Session Mode gives you better resolution, clipboard sharing, and easier interaction.

### In the Ubuntu VM:

1. Open Terminal (Ctrl+Alt+T)

2. Run this script to install Enhanced Session Mode:
```bash
# Download and run the Enhanced Session script
wget https://raw.githubusercontent.com/Hinara/linux-vm-tools/ubuntu20-04/ubuntu/22.04/install.sh
chmod +x install.sh
sudo ./install.sh
```

3. When prompted:
   - Enter your password
   - Press **Y** to continue
   - The script will install xrdp and configure Enhanced Session

4. Reboot the VM:
```bash
sudo reboot
```

### On Windows (Hyper-V Host):

1. Open PowerShell **as Administrator**

2. Run this command to enable Enhanced Session for your VM:
```powershell
Set-VM -VMName "Katana-Ubuntu-Test" -EnhancedSessionTransportType HvSocket
```
(Replace "Katana-Ubuntu-Test" with your VM name if different)

### Connect with Enhanced Session:

1. In Hyper-V Manager, double-click your VM to connect
2. You should see a connection options dialog with resolution choices
3. Select your desired resolution → **Connect**
4. Log in when prompted

You should now have a better desktop experience with copy/paste working between Windows and Ubuntu!

## Step 5: Install Docker

In your Ubuntu VM, open Terminal and run these commands:

```bash
# Update package list
sudo apt update

# Install prerequisites
sudo apt install -y ca-certificates curl

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package list again
sudo apt update

# Install Docker
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to docker group (so you don't need sudo for docker commands)
sudo usermod -aG docker $USER

# Log out and back in for group change to take effect
echo "Docker installed! Log out and back in for group membership to take effect."
```

**Important:** After running these commands, log out and log back in (or reboot) for the Docker group membership to take effect.

Verify Docker is working:
```bash
docker --version
docker compose version
```

## Step 6: Install Bun (for Katana Development)

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Reload your shell
source ~/.bashrc

# Verify
bun --version
```

## Step 7: Clone Katana Repository

If you want to develop Katana inside the VM:

```bash
# Install git if needed
sudo apt install -y git

# Clone the repository
cd ~
git clone https://github.com/SamuraiWTF/katana.git
cd katana

# Install dependencies
bun install
```

Alternatively, you can share your Windows development directory with the VM using Hyper-V shared folders, but mounting the repo inside the VM is simpler.

## Step 8: Test Katana

Now you can test Katana in the local scenario:

```bash
cd ~/katana

# Run from source
bun run src/cli.ts --help

# Initialize certificates
bun run src/cli.ts cert init

# Setup privileged port binding
sudo bun run src/cli.ts setup-proxy

# Install a target
bun run src/cli.ts install dvwa

# Sync DNS (this updates /etc/hosts)
sudo bun run src/cli.ts dns sync --all

# Start the proxy
bun run src/cli.ts proxy start
```

Open Firefox in the Ubuntu VM and navigate to:
1. Export CA cert: `bun run src/cli.ts cert export`
2. Import the CA cert into Firefox
3. Visit `https://katana.samurai.wtf`
4. Visit `https://dvwa.samurai.wtf`

Everything should work as designed!

## Troubleshooting

### VM won't boot / Secure Boot error
- Go to VM Settings → Security → Disable Secure Boot

### Can't connect with Enhanced Session
- Make sure you ran the install script in the VM
- Make sure you ran the PowerShell command on the Windows host
- Try rebooting both the VM and Windows host

### VM has no internet
- Check that VM is connected to "Default Switch" in VM Settings → Network Adapter
- Try: `sudo dhclient -r && sudo dhclient` in the VM to renew IP

### Docker permission denied
- Make sure you logged out and back in after adding yourself to docker group
- Check: `groups` should show "docker" in the list

### Need to access files from Windows
- You can use Hyper-V shared folders, or
- Use git to push/pull changes, or
- Set up SSH and use scp/sftp from Windows

## Tips

- **Snapshot your VM** after Docker installation so you can roll back if needed
- **Pause the VM** when not testing to save RAM
- **Export the VM** if you want to share the setup with others

## Next Steps

Once everything is working, you can:
- Test all Katana targets
- Test the full install/start/stop/remove lifecycle
- Export and import CA certificates
- Test the web dashboard
- Document any bugs you find

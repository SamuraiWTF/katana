import os
import pwd
import subprocess
import shutil
import time
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from .Plugin import Plugin

class DesktopIntegration(Plugin):
    """Plugin for handling desktop integration tasks like menu items and favorites."""

    @classmethod
    def get_aliases(cls):
        return ['desktop']

    def __init__(self):
        super().__init__()
        # Get the real user's home directory (not root's)
        sudo_user = os.environ.get('SUDO_USER', 'samurai')  # Default to samurai if not set
        try:
            self.user_home = Path(pwd.getpwnam(sudo_user).pw_dir)
            self.real_user = sudo_user
        except KeyError:
            self.user_home = Path('/home/samurai')  # Fallback to samurai
            self.real_user = 'samurai'
        
        self.apps_dir = self.user_home / '.local/share/applications'
        self.apps_dir.mkdir(parents=True, exist_ok=True)
        # Ensure correct ownership
        if os.geteuid() == 0:  # If running as root
            uid = pwd.getpwnam(self.real_user).pw_uid
            gid = pwd.getpwnam(self.real_user).pw_gid
            os.chown(self.apps_dir, uid, gid)

    def _run_as_user(self, cmd: list, check: bool = True) -> subprocess.CompletedProcess:
        """Run a command as the real user instead of root."""
        if os.geteuid() == 0:  # If we're root
            cmd = ['runuser', '-u', self.real_user, '--'] + cmd
        return subprocess.run(cmd, check=check, text=True, capture_output=True)

    def _run_gsettings_command(self, args: list) -> subprocess.CompletedProcess:
        """Run a gsettings command with proper dbus setup."""
        try:
            # Try to get the dbus session address
            dbus_cmd = ['dbus-launch']
            dbus_result = subprocess.run(dbus_cmd, capture_output=True, text=True)
            if dbus_result.returncode == 0:
                # Parse dbus-launch output to get DBUS_SESSION_BUS_ADDRESS
                env = os.environ.copy()
                for line in dbus_result.stdout.splitlines():
                    if '=' in line:
                        key, value = line.split('=', 1)
                        env[key] = value.rstrip(';')
                
                # Run gsettings with the dbus environment
                cmd = ['gsettings'] + args
                if os.geteuid() == 0:  # If we're root
                    cmd = ['runuser', '-u', self.real_user, '--'] + cmd
                return subprocess.run(cmd, env=env, check=False, text=True, capture_output=True)
            else:
                return self._run_as_user(['gsettings'] + args)
        except FileNotFoundError:
            return self._run_as_user(['gsettings'] + args)

    def _is_supported_environment(self) -> bool:
        """Check if we're in a supported environment."""
        return os.name == 'posix'

    def _update_desktop_database(self):
        """Update the desktop database if possible."""
        try:
            # Update both system and user databases
            if os.geteuid() == 0:
                # System-wide update
                subprocess.run(['update-desktop-database'], check=True)
            
            # User-specific update
            self._run_as_user(['update-desktop-database', str(self.apps_dir)], check=True)
            
            # Also try updating the cached applications
            self._run_as_user(['gtk-update-icon-cache', '-f', '-t', str(self.user_home / '.local/share/icons')], check=False)
            self._run_as_user(['xdg-desktop-menu', 'forceupdate'], check=False)
        except (subprocess.SubprocessError, FileNotFoundError) as e:
            print(f"Warning: desktop database update failed: {str(e)}")

    def _validate_desktop_file(self, content: str) -> Tuple[bool, Optional[str]]:
        """Validate desktop file content."""
        required_fields = ['Type', 'Name', 'Exec']
        missing = [field for field in required_fields if f"{field}=" not in content]
        if missing:
            return False, f"Missing required fields: {', '.join(missing)}"
        return True, None

    def _update_favorites(self, filename: str, add: bool = True) -> Tuple[bool, Optional[str]]:
        """Update GNOME favorites using gsettings."""
        try:
            # Get current favorites
            result = self._run_gsettings_command(['get', 'org.gnome.shell', 'favorite-apps'])
            if result.returncode != 0:
                return False, "Failed to get current favorites"
            
            # Add a short delay after reading
            time.sleep(1)
            
            # Parse the current favorites string into a list
            try:
                # The output is typically in the format: ['app1.desktop', 'app2.desktop']
                # Or @as [] for an empty list
                current = result.stdout.strip()
                if current == '@as []':
                    current_favs = []
                else:
                    if current.startswith('[') and current.endswith(']'):
                        current = current[1:-1]  # Remove [ and ]
                    # Split and clean each item, filtering out empty strings
                    current_favs = [x.strip("' ") for x in current.split(',') if x.strip("' ")]
                    # Remove any empty strings that might have slipped through
                    current_favs = [x for x in current_favs if x]
            except Exception as e:
                print(f"Warning: Error parsing favorites ({str(e)}), starting with empty list")
                current_favs = []

            print(f"Current favorites: {current_favs}")
            
            # Update favorites list and track if changes were made
            changed = False
            if add:
                if filename not in current_favs:
                    current_favs.append(filename)
                    changed = True
                    print(f"Adding {filename} to favorites")
                else:
                    print(f"Note: {filename} is already in favorites")
            else:
                if filename in current_favs:
                    current_favs = [x for x in current_favs if x != filename]
                    changed = True
                    print(f"Removing {filename} from favorites")
                else:
                    print(f"Note: {filename} was not in favorites")
            
            # Convert to gsettings format and update
            favs_str = "[" + ", ".join(f"'{x}'" for x in current_favs) + "]"
            print(f"Updating favorites to: {favs_str}")
            
            # Add a short delay before setting
            time.sleep(1)
            
            # Always run the set command due to gsettings caching
            result = self._run_gsettings_command(['set', 'org.gnome.shell', 'favorite-apps', favs_str])
            
            # Add a short delay after setting
            time.sleep(1)
            
            if result.returncode == 0:
                if changed:
                    return True, "Updated GNOME favorites"
                else:
                    return True, "Refreshed GNOME favorites (no changes needed)"
            return False, "Failed to update favorites"
            
        except subprocess.SubprocessError as e:
            return False, f"Failed to update favorites: {str(e)}"

    def install(self, params: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Install a desktop file and optionally add to favorites."""
        required_params = ['desktop_file']
        self._validate_params(params, required_params, 'desktop')
        
        if not self._is_supported_environment():
            return False, "Not a supported environment (requires POSIX)"
        
        desktop_file = params.get('desktop_file')
        if not desktop_file:
            return False, "No desktop file configuration provided"

        content = desktop_file.get('content', '')
        filename = desktop_file.get('filename')
        add_to_favorites = desktop_file.get('add_to_favorites', False)

        if not content or not filename:
            return False, "Missing required desktop file content or filename"

        # Validate desktop file content
        is_valid, error = self._validate_desktop_file(content)
        if not is_valid:
            return False, f"Invalid desktop file: {error}"

        # Ensure filename has .desktop extension
        if not filename.endswith('.desktop'):
            filename += '.desktop'

        # Write desktop file
        desktop_path = self.apps_dir / filename
        changed = False
        msg_parts = []

        try:
            # Check if content is different
            if desktop_path.exists():
                old_content = desktop_path.read_text()
                if old_content == content:
                    msg_parts.append("Desktop file unchanged")
                else:
                    changed = True
            else:
                changed = True

            if changed:
                desktop_path.write_text(content)
                desktop_path.chmod(0o755)
                # Ensure correct ownership
                if os.geteuid() == 0:  # If running as root
                    uid = pwd.getpwnam(self.real_user).pw_uid
                    gid = pwd.getpwnam(self.real_user).pw_gid
                    os.chown(desktop_path, uid, gid)
                msg_parts.append("Desktop file created/updated")

            # Try using xdg-desktop-menu as the real user
            try:
                result = self._run_as_user(['xdg-desktop-menu', 'install', '--novendor', str(desktop_path)])
                msg_parts.append("Registered with desktop menu")
                changed = True
            except subprocess.SubprocessError as e:
                self._update_desktop_database()
                msg_parts.append("Updated desktop database")

            # Add to favorites if requested
            if add_to_favorites:
                fav_changed, fav_msg = self._update_favorites(filename, add=True)
                if fav_changed:
                    changed = True
                if fav_msg:
                    msg_parts.append(fav_msg)

            return changed, "; ".join(msg_parts)
        except Exception as e:
            return False, f"Failed to install desktop file: {str(e)}"

    def remove(self, params: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Remove a desktop file and from favorites if present."""
        required_params = ['filename']
        self._validate_params(params, required_params, 'desktop')
        
        if not self._is_supported_environment():
            return False, "Not a supported environment (requires POSIX)"

        filename = params.get('filename')
        if not filename:
            return False, "No filename provided"

        if not filename.endswith('.desktop'):
            filename += '.desktop'

        desktop_path = self.apps_dir / filename
        changed = False
        msg_parts = []

        try:
            # Try using xdg-desktop-menu first
            try:
                self._run_as_user(['xdg-desktop-menu', 'uninstall', '--novendor', str(desktop_path)])
                msg_parts.append("Unregistered from desktop menu")
                changed = True
            except subprocess.SubprocessError:
                if desktop_path.exists():
                    desktop_path.unlink()
                    changed = True
                    msg_parts.append("Removed desktop file")
                self._update_desktop_database()
                msg_parts.append("Updated desktop database")

            # Remove from favorites if present
            fav_changed, fav_msg = self._update_favorites(filename, add=False)
            if fav_changed:
                changed = True
            if fav_msg:
                msg_parts.append(fav_msg)

            return changed, "; ".join(msg_parts) if msg_parts else None
        except Exception as e:
            return False, f"Failed to remove desktop file: {str(e)}"

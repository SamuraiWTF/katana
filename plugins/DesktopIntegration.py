import os
import pwd
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from .Plugin import Plugin

try:
    import gi
    gi.require_version('Gio', '2.0')
    from gi.repository import Gio
    HAVE_GIO = True
except (ImportError, ValueError):
    HAVE_GIO = False

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

    def _is_supported_environment(self) -> bool:
        """Check if we're in a supported desktop environment."""
        if os.name != 'posix':
            return False
        
        # Check for display as the real user
        try:
            # Try to get DISPLAY from the user's environment
            result = self._run_as_user(['sh', '-c', 'echo $DISPLAY'], check=False)
            display = result.stdout.strip() if result.stdout else None
            
            # Try to get WAYLAND_DISPLAY from the user's environment
            result = self._run_as_user(['sh', '-c', 'echo $WAYLAND_DISPLAY'], check=False)
            wayland = result.stdout.strip() if result.stdout else None
            
            if not display and not wayland:
                # Fall back to current environment if needed
                display = os.environ.get('DISPLAY')
                wayland = os.environ.get('WAYLAND_DISPLAY')
                
            return bool(display or wayland)
        except subprocess.SubprocessError:
            # Fall back to checking current environment
            return bool(os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'))

    def _is_gnome(self) -> bool:
        """Check if running under GNOME."""
        try:
            # Try to get XDG_CURRENT_DESKTOP from the user's environment
            result = self._run_as_user(['sh', '-c', 'echo $XDG_CURRENT_DESKTOP'], check=False)
            desktop = result.stdout.strip() if result.stdout else None
            
            # Fall back to current environment if needed
            if not desktop:
                desktop = os.environ.get('XDG_CURRENT_DESKTOP', '')
                
            return desktop.lower() == 'gnome'
        except subprocess.SubprocessError:
            return os.environ.get('XDG_CURRENT_DESKTOP', '').lower() == 'gnome'

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

    def _add_to_gnome_favorites(self, desktop_id: str) -> Tuple[bool, Optional[str]]:
        """Add an application to GNOME favorites."""
        if not HAVE_GIO or not self._is_gnome():
            return False, "GNOME integration not available"

        try:
            # Run gsettings as the real user
            cmd = [
                'gsettings', 'get', 'org.gnome.shell', 'favorite-apps'
            ]
            result = self._run_as_user(cmd, check=True)
            current_favs = eval(result.stdout)  # Convert string repr of list to actual list
            
            if desktop_id not in current_favs:
                current_favs.append(desktop_id)
                set_cmd = [
                    'gsettings', 'set', 'org.gnome.shell', 'favorite-apps',
                    str(current_favs)
                ]
                self._run_as_user(set_cmd, check=True)
                return True, "Added to GNOME favorites"
            return False, "Already in favorites"
        except Exception as e:
            return False, f"Failed to add to favorites: {str(e)}"

    def install(self, params: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Install a desktop file and optionally add to favorites."""
        required_params = ['desktop_file']
        self._validate_params(params, required_params, 'desktop')
        
        if not self._is_supported_environment():
            print(f"Debug: Display={os.environ.get('DISPLAY')}, Wayland={os.environ.get('WAYLAND_DISPLAY')}")
            try:
                result = self._run_as_user(['sh', '-c', 'env | grep -E "DISPLAY|WAYLAND|DESKTOP"'])
                print(f"Debug: User environment:\n{result.stdout}")
            except:
                pass
            return False, "Not a supported desktop environment"
        
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

                # Debug: show file contents and permissions
                print(f"Debug: Desktop file path: {desktop_path}")
                print(f"Debug: Desktop file contents:\n{content}")
                if desktop_path.exists():
                    print(f"Debug: File permissions: {oct(desktop_path.stat().st_mode)}")
                    print(f"Debug: File owner: {desktop_path.stat().st_uid}:{desktop_path.stat().st_gid}")

            # Try using xdg-desktop-menu as the real user
            try:
                result = self._run_as_user(['xdg-desktop-menu', 'install', '--novendor', str(desktop_path)])
                print(f"Debug: xdg-desktop-menu output:\nstdout: {result.stdout}\nstderr: {result.stderr}")
                msg_parts.append("Registered with desktop menu")
                changed = True
            except subprocess.SubprocessError as e:
                print(f"Debug: xdg-desktop-menu failed: {str(e)}")
                self._update_desktop_database()
                msg_parts.append("Updated desktop database")

            # Add to favorites if requested
            if add_to_favorites:
                fav_changed, fav_msg = self._add_to_gnome_favorites(filename)
                if fav_changed:
                    changed = True
                if fav_msg:
                    msg_parts.append(fav_msg)

            return changed, "; ".join(msg_parts)
        except Exception as e:
            print(f"Debug: Installation failed: {str(e)}")
            return False, f"Failed to install desktop file: {str(e)}"

    def remove(self, params: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Remove a desktop file and from favorites if present."""
        required_params = ['filename']
        self._validate_params(params, required_params, 'desktop')
        
        if not self._is_supported_environment():
            return False, "Not a supported desktop environment"

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

            # Remove from favorites if in GNOME
            if HAVE_GIO and self._is_gnome():
                try:
                    cmd = ['gsettings', 'get', 'org.gnome.shell', 'favorite-apps']
                    result = self._run_as_user(cmd, check=True)
                    current_favs = eval(result.stdout)
                    
                    if filename in current_favs:
                        current_favs.remove(filename)
                        set_cmd = [
                            'gsettings', 'set', 'org.gnome.shell', 'favorite-apps',
                            str(current_favs)
                        ]
                        self._run_as_user(set_cmd, check=True)
                        changed = True
                        msg_parts.append("Removed from GNOME favorites")
                except Exception as e:
                    msg_parts.append(f"Failed to remove from favorites: {str(e)}")

            return changed, "; ".join(msg_parts) if msg_parts else None
        except Exception as e:
            return False, f"Failed to remove desktop file: {str(e)}"

import os
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
        self.apps_dir = Path.home() / '.local/share/applications'
        self.apps_dir.mkdir(parents=True, exist_ok=True)

    def _is_supported_environment(self) -> bool:
        """Check if we're in a supported desktop environment."""
        if os.name != 'posix':
            return False
        
        if not os.environ.get('DISPLAY') and not os.environ.get('WAYLAND_DISPLAY'):
            return False

        return True

    def _is_gnome(self) -> bool:
        """Check if running under GNOME."""
        return os.environ.get('XDG_CURRENT_DESKTOP', '').lower() == 'gnome'

    def _update_desktop_database(self):
        """Update the desktop database if possible."""
        try:
            subprocess.run(['update-desktop-database', str(self.apps_dir)], check=True)
        except (subprocess.SubprocessError, FileNotFoundError):
            pass  # Best effort

    def _add_to_gnome_favorites(self, desktop_id: str) -> Tuple[bool, Optional[str]]:
        """Add an application to GNOME favorites."""
        if not HAVE_GIO or not self._is_gnome():
            return False, "GNOME integration not available"

        try:
            settings = Gio.Settings.new('org.gnome.shell')
            current_favs = settings.get_strv('favorite-apps')
            
            if desktop_id not in current_favs:
                current_favs.append(desktop_id)
                settings.set_strv('favorite-apps', current_favs)
                return True, "Added to GNOME favorites"
            return False, "Already in favorites"
        except Exception as e:
            return False, f"Failed to add to favorites: {str(e)}"

    def install(self, params: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Install a desktop file and optionally add to favorites."""
        required_params = ['desktop_file']
        self._validate_params(params, required_params, 'desktop')
        
        if not self._is_supported_environment():
            return False, "Not a supported desktop environment"
        
        desktop_file = params.get('desktop_file')
        if not desktop_file:
            return False, "No desktop file configuration provided"

        content = desktop_file.get('content', '')
        filename = desktop_file.get('filename')
        add_to_favorites = desktop_file.get('add_to_favorites', False)

        if not content or not filename:
            return False, "Missing required desktop file content or filename"

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
                msg_parts.append("Desktop file created/updated")

            # Try using xdg-desktop-menu first
            try:
                subprocess.run(['xdg-desktop-menu', 'install', '--novendor', str(desktop_path)], check=True)
                msg_parts.append("Registered with desktop menu")
                changed = True
            except (subprocess.SubprocessError, FileNotFoundError):
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
                subprocess.run(['xdg-desktop-menu', 'uninstall', '--novendor', str(desktop_path)], check=True)
                msg_parts.append("Unregistered from desktop menu")
                changed = True
            except (subprocess.SubprocessError, FileNotFoundError):
                if desktop_path.exists():
                    desktop_path.unlink()
                    changed = True
                    msg_parts.append("Removed desktop file")
                self._update_desktop_database()
                msg_parts.append("Updated desktop database")

            # Remove from favorites if in GNOME
            if HAVE_GIO and self._is_gnome():
                try:
                    settings = Gio.Settings.new('org.gnome.shell')
                    current_favs = settings.get_strv('favorite-apps')
                    if filename in current_favs:
                        current_favs.remove(filename)
                        settings.set_strv('favorite-apps', current_favs)
                        changed = True
                        msg_parts.append("Removed from GNOME favorites")
                except Exception as e:
                    msg_parts.append(f"Failed to remove from favorites: {str(e)}")

            return changed, "; ".join(msg_parts) if msg_parts else None
        except Exception as e:
            return False, f"Failed to remove desktop file: {str(e)}"

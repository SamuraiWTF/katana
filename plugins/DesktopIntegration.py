import os
import subprocess
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
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

    def _add_to_gnome_favorites(self, desktop_id: str):
        """Add an application to GNOME favorites."""
        if not HAVE_GIO or not self._is_gnome():
            return

        settings = Gio.Settings.new('org.gnome.shell')
        current_favs = settings.get_strv('favorite-apps')
        
        if desktop_id not in current_favs:
            current_favs.append(desktop_id)
            settings.set_strv('favorite-apps', current_favs)

    def install(self, params: Dict[str, Any]):
        """Install a desktop file and optionally add to favorites."""
        required_params = ['desktop_file']
        self._validate_params(params, required_params, 'desktop')
        
        if not self._is_supported_environment():
            return
        
        desktop_file = params.get('desktop_file')
        if not desktop_file:
            return

        content = desktop_file.get('content', '')
        filename = desktop_file.get('filename')
        add_to_favorites = desktop_file.get('add_to_favorites', False)

        if not content or not filename:
            return

        # Ensure filename has .desktop extension
        if not filename.endswith('.desktop'):
            filename += '.desktop'

        # Write desktop file
        desktop_path = self.apps_dir / filename
        desktop_path.write_text(content)
        desktop_path.chmod(0o755)

        # Try using xdg-desktop-menu first
        try:
            subprocess.run(['xdg-desktop-menu', 'install', '--novendor', str(desktop_path)], check=True)
        except (subprocess.SubprocessError, FileNotFoundError):
            self._update_desktop_database()

        # Add to favorites if requested
        if add_to_favorites:
            self._add_to_gnome_favorites(filename)

    def remove(self, params: Dict[str, Any]):
        """Remove a desktop file and from favorites if present."""
        required_params = ['filename']
        self._validate_params(params, required_params, 'desktop')
        
        if not self._is_supported_environment():
            return

        filename = params.get('filename')
        if not filename:
            return

        if not filename.endswith('.desktop'):
            filename += '.desktop'

        desktop_path = self.apps_dir / filename

        # Try using xdg-desktop-menu first
        try:
            subprocess.run(['xdg-desktop-menu', 'uninstall', '--novendor', str(desktop_path)], check=True)
        except (subprocess.SubprocessError, FileNotFoundError):
            if desktop_path.exists():
                desktop_path.unlink()
            self._update_desktop_database()

        # Remove from favorites if in GNOME
        if HAVE_GIO and self._is_gnome():
            settings = Gio.Settings.new('org.gnome.shell')
            current_favs = settings.get_strv('favorite-apps')
            if filename in current_favs:
                current_favs.remove(filename)
                settings.set_strv('favorite-apps', current_favs)

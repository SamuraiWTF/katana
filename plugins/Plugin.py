import katanaerrors
import subprocess
import shlex


class Plugin(object):

    def _validate_params(self, params, required_params, plugin_name):
        for key in required_params:
            if params is None or key not in params.keys():
                raise katanaerrors.MissingRequiredParam(key, plugin_name)

    def _run_command(self, cmd, shell=None, unsafe=None, cwd=None):
        if not unsafe:
            cmd = shlex.split(cmd)
        return subprocess.run(cmd, shell=shell, cwd=cwd)

    @classmethod
    def get_aliases(cls):
        return [cls.__name__]

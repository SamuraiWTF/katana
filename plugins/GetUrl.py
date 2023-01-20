from plugins import Plugin, Unarchive
import requests
import os
import os.path
import re
from urllib.parse import urlparse
import katanaerrors


def _get_link_from_page(url, link_pattern):
    response = requests.get(url)
    print("Fetched response as code={}".format(response.status_code))
    urls = re.findall(link_pattern, response.text)

    print("URLs {}".format(urls))

    if len(urls) > 0:
        if urls[0].startswith("http"):
            return urls[0]
        else:
            parsed_uri = urlparse(response.url)
            return '{}://{}{}'.format(parsed_uri.scheme, parsed_uri.netloc, urls[0])

    else:
        # TODO: there's probably a better way to do this
        # This is specifically to address GitHub's <include-fragment> custom HTML tag
        # 'expanded_assets' is a line present in several GH Releases pages, 
        # so I figured it would work pretty well.
        if 'expanded_assets' in response.text:
            regex_find_src = '.*expanded_assets.*'
            find_src = re.findall(regex_find_src, response.text)
            for line in find_src:
                find_assets = line.split('"')
                if len(find_assets) > 0:
                    for r in range(len(find_assets)):
                        if find_assets[r].startswith('http'):
                            return _get_link_from_page(find_assets[r], link_pattern)

        print(response.text)
        raise katanaerrors.CriticalFunctionFailure('get_url', 'Could not find link pattern in resulting page.')


class GetUrl(Plugin):

    @classmethod
    def get_aliases(cls):
        return ["get_url"]

    def any(self, params):
        self._validate_params(params, ['url', 'dest'], 'get_url')

        if os.path.exists(params.get('dest')) and not params.get('overwrite', False):
            return False, 'The specified file already exists: {}'.format(params.get('dest'))
        else:
            link_pattern = params.get('link_pattern')

            if link_pattern is not None:
                url = _get_link_from_page(params.get('url'), link_pattern)
            else:
                url = params.get('url')

            if url.endswith('.tgz') or url.endswith('.tar.gz'):
                unarch_plugin = Unarchive()
                unarch_params = {'url': url, 'dest' : params.get('dest')}
                return unarch_plugin.any(unarch_params)
            else:
                print("      Downloading {}...".format(url))

                r = requests.get(url, stream=True)

                with open(params.get("dest"), "wb") as output:
                    for chunk in r.iter_content(chunk_size=1024):
                        if chunk:
                            output.write(chunk)
                return True, None

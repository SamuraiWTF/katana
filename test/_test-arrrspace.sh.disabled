#!/usr/bin/env bash

set -e

katana install arrrspace

curl --fail -o /dev/null --retry 5 --retry-all-errors http://arrrspace.test:80/
curl --fail -o /dev/null --retry 5 --retry-all-errors http://arrrspace.wtf:80/
curl --fail -o /dev/null --retry 5 --retry-all-errors http://api.arrrspace.test:80/
curl --fail -o /dev/null --retry 5 --retry-all-errors http://api.arrrspace.wtf:80/

katana remove arrrspace

echo -e "\nPASSED\n"

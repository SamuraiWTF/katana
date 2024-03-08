#!/usr/bin/env bash

set -e

katana install dvga
sleep 2
katana start dvga

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:5013/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://dvga.test:8443/

katana stop dvga
sleep 2
katana remove dvga

echo -e "\nPASSED\n"

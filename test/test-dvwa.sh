#!/usr/bin/env bash

set -e

katana install dvwa
sleep 2
katana start dvwa

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:31000/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://dvwa.test:8443/

katana stop dvwa
sleep 2
katana remove dvwa

echo -e "\nPASSED\n"

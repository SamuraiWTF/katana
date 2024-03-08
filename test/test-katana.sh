#!/usr/bin/env bash

set -e

katana install katana
sleep 2
katana start katana

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:8087/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://katana.test:8443/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://katana.wtf:8443/

katana stop katana
sleep 2
katana remove katana

echo -e "\nPASSED\n"

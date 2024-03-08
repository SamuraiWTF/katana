#!/usr/bin/env bash

set -e

katana install ssrf
sleep 2
katana start ssrf

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:8000/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://ssrf.test:8443/

katana stop ssrf
sleep 2
katana remove ssrf

echo -e "\nPASSED\n"

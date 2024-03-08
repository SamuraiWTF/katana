#!/usr/bin/env bash

set -e

katana install vapi
sleep 2
katana start vapi

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:8000/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://vapi.test:8443/

katana stop vapi
sleep 2
katana remove vapi

echo -e "\nPASSED\n"

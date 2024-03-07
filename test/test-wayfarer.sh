#!/usr/bin/env bash

set -e

katana install wayfarer
sleep 2
katana start wayfarer

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:7000/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://wayfarer.test:8443/

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:7001/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://api.wayfarer.test:8443/

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:3002/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://auth.wayfarer.test:8443/

katana stop wayfarer
sleep 2
katana remove wayfarer

echo -e "\nPASSED\n"

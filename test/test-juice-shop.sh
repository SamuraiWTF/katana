#!/usr/bin/env bash

set -e

katana install juice-shop
sleep 2
katana start juice-shop

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:3000/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://juice-shop.test:8443/

katana stop juice-shop
sleep 2
katana remove juice-shop

echo -e "\nPASSED\n"

#!/usr/bin/env bash

set -e

katana install mutillidae
sleep 2
katana start mutillidae

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:33081/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://mutillidae.test:8443/

katana stop mutillidae
sleep 2
katana remove mutillidae

echo -e "\nPASSED\n"

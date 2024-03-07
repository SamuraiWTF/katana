#!/usr/bin/env bash

set -e

katana install wrongsecrets
sleep 2
katana start wrongsecrets

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:31500/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://wrongsecrets.test:8443/

katana stop wrongsecrets
sleep 2
katana remove wrongsecrets

echo -e "\nPASSED\n"

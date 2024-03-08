#!/usr/bin/env bash

set -e

katana install plugin-labs
sleep 2
katana start plugin-labs

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:33180/
curl --fail -o /dev/null --retry 5 --retry-all-errors http://plugin-labs.wtf:80/

katana stop plugin-labs
sleep 2
katana remove plugin-labs

echo -e "\nPASSED\n"

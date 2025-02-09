#!/usr/bin/env bash

set -e

katana install samurai-dojo
sleep 2
katana start samurai-dojo

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:30080/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://dojo-basic.test:8443/

curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:31080/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://dojo-scavenger.test:8443/

katana stop samurai-dojo
sleep 2
katana remove samurai-dojo

echo -e "\nPASSED\n"

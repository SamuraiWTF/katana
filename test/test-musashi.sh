#!/usr/bin/env bash

set -e

katana install musashi
sleep 2
katana start musashi

# jwt-demo
curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:3050/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://jwt-demo.test:8443/

# csp-dojo
curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:3041/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://csp-dojo.test:8443/

# api.cors
curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:3020/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://api.cors.test:8443/

# cors-dojo
curl --fail -o /dev/null --retry 5 --retry-all-errors http://localhost:3021/
curl --fail -o /dev/null --retry 5 --retry-all-errors -k https://cors-dojo.test:8443/

katana stop musashi
sleep 2
katana remove musashi

echo -e "\nPASSED\n"

#!/usr/bin/env bash

set -e

katana install k8s-labs
sleep 2
katana start k8s-labs

curl --fail -o /dev/null --retry 5 --retry-all-errors http://k8s-labs.wtf:80/
curl --fail -o /dev/null --retry 5 --retry-all-errors http://api.k8s-labs.wtf:80/

katana stop k8s-labs
sleep 2
katana remove k8s-labs

echo -e "\nPASSED\n"

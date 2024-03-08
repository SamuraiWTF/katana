#!/usr/bin/env bash

set -e

katana install amoksecurity

curl --fail -o /dev/null --retry 5 --retry-all-errors http://amoksecurity.test:80/
curl --fail -o /dev/null --retry 5 --retry-all-errors http://amoksecurity.wtf:80/

katana remove amoksecurity

echo -e "\nPASSED\n"

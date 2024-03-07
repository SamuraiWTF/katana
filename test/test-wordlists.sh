#!/usr/bin/env bash

set -e

katana install wordlists

test -f /opt/samurai/wordlists/fuzzdb/README.md
test -f /opt/samurai/wordlists/seclists/README.md

katana remove wordlists

echo -e "\nPASSED\n"

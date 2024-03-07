#!/usr/bin/env bash

set -e

katana install burpsuite

command -v burp

katana remove burpsuite

echo -e "\nPASSED\n"

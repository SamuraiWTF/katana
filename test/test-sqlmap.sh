#!/usr/bin/env bash

set -e

katana install sqlmap

sqlmap --version

katana remove sqlmap

echo -e "\nPASSED\n"

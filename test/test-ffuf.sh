#!/usr/bin/env bash

set -e

katana install ffuf

ffuf -V

katana remove ffuf

echo -e "\nPASSED\n"

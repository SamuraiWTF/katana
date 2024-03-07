#!/usr/bin/env bash

set -e

katana install postman

command -v postman

katana remove postman

echo -e "\nPASSED\n"

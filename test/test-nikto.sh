#!/usr/bin/env bash

set -e

katana install nikto

nikto --Version

katana remove nikto

echo -e "\nPASSED\n"

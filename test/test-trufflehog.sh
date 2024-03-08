#!/usr/bin/env bash

set -e

katana install trufflehog

trufflehog --version

katana remove trufflehog

echo -e "\nPASSED\n"

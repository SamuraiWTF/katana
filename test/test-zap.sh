#!/usr/bin/env bash

set -e

katana install zap

/opt/samurai/ZAP_2.14.0/zap.sh -cmd -version

katana remove zap

echo -e "\nPASSED\n"

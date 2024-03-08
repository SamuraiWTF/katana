#!/usr/bin/env bash

for TEST_SCRIPT in $(find "$(dirname "$0")" -name "test-*sh" -not -name "$(basename "$0")"); do
  echo -n "${TEST_SCRIPT} ... "
  "${TEST_SCRIPT}" >/dev/null 2>/dev/null
  if [[ $? -eq 0 ]]; then
    echo "PASSED"
  else
    echo "FAILED"
  fi
done

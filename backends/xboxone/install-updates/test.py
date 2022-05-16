#!/usr/bin/env python3
#
# Copyright 2022 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Test Xbox One Update Status tool against sample screenshots."""

import subprocess
import os
import sys

SOURCE_PATH = os.path.dirname(__file__)
SAMPLES_PATH = os.path.join(SOURCE_PATH, 'sample-screenshots')
TOOL_PATH = os.path.join(SOURCE_PATH, 'xbox-one-update-status.py')

def main():
  exit_code = 0

  for status in sorted(os.listdir(SAMPLES_PATH)):
    status_path = os.path.join(SAMPLES_PATH, status)

    for filename in sorted(os.listdir(status_path)):
      image_path = os.path.join(status_path, filename)

      args = [TOOL_PATH, image_path]
      detected_status = subprocess.check_output(args, text=True).strip()

      if detected_status == status:
        pass_fail = 'PASS'
      else:
        pass_fail = 'FAIL'
        exit_code = 1

      print('{} - {} => {}'.format(pass_fail, image_path, detected_status))

  return exit_code

if __name__ == '__main__':
  sys.exit(main())

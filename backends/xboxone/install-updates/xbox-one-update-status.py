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

"""Detect Xbox One update status from a screenshot."""

import argparse
import cv2
import numpy
import os
import sys

SOURCE_PATH = os.path.dirname(__file__)
TARGETS_PATH = os.path.join(SOURCE_PATH, 'target-sub-images')

# Matching is done in grayscale and based on edges.
# Based on https://docs.opencv.org/4.x/da/d22/tutorial_py_canny.html
# and https://docs.opencv.org/4.x/d4/dc6/tutorial_py_template_matching.html

# Thresholds for Canny edge detection.
# These are the same thresholds used in https://github.com/johnoneil/subimage
CANNY_EDGE_THRESHOLD_MIN = 32
CANNY_EDGE_THRESHOLD_MAX = 128

class Image(object):
  def __init__(self, path):
    """Load and preprocess an image."""

    self.path = path
    # Load the image in grayscale.
    self.image = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    # Detect the edges and cache them.
    self.edges = cv2.Canny(
        self.image, CANNY_EDGE_THRESHOLD_MIN, CANNY_EDGE_THRESHOLD_MAX)

  def contains(self, sub_image, confidence):
    """Determine if this image contains the given sub-image."""

    # Compare the edges when looking for a match.
    result = cv2.matchTemplate(self.edges, sub_image.edges, cv2.TM_CCOEFF_NORMED)
    # Filter for matches above our confidence threshold.
    locations = numpy.where(result >= confidence)
    # "locations" is an array of 2 arrays, containing x and y coordinates of
    # matches, respectively.  To know if we have a match, all we care about is
    # that they are non-empty.  We arbitrarily check the x coordinate array.
    return len(locations[0]) != 0


def load_target_sub_images(path):
  """Load target sub-images from PATH/STATUS/*.png.

  Returns a dictionary mapping status keys to arrays of sub-images."""

  result = {}

  for status in os.listdir(path):
    result[status] = []

    status_path = os.path.join(path, status)
    for filename in os.listdir(status_path):
      image_path = os.path.join(status_path, filename)
      result[status].append(Image(image_path))

  return result


def main():
  parser = argparse.ArgumentParser(description=__doc__)

  parser.add_argument(
      '--target-sub-images', '-t',
      default=TARGETS_PATH,
      help='Folder full of target sub-images, organized by status')

  parser.add_argument(
      '--confidence', '-c',
      type=float,
      default=0.80,
      help='Confidence level required for matching, between 0 and 1.')

  parser.add_argument(
      'input',
      metavar='INPUT_IMAGE',
      help='Input screenshot to detect status.')

  args = parser.parse_args()

  input_image = Image(args.input)
  target_sub_images = load_target_sub_images(args.target_sub_images)

  for status, sub_images in target_sub_images.items():
    for sub_image in sub_images:
      if input_image.contains(sub_image, args.confidence):
        print(status)
        return 0

  print('Unable to determine status!', file=sys.stderr)
  return 1

if __name__ == '__main__':
  sys.exit(main())

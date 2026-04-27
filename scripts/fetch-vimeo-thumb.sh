#!/bin/bash
# Fetch a Vimeo thumbnail and save as a 1200x630 OG image.
# Usage:
#   ./scripts/fetch-vimeo-thumb.sh VIDEO_ID OUTPUT_FILENAME [HASH]
# Examples:
#   ./scripts/fetch-vimeo-thumb.sh 1090852657 lucid-horizon-workshop
#   ./scripts/fetch-vimeo-thumb.sh 1075782631 known-productions-workshop 63baf05123
# The HASH is required for unlisted/private Vimeo videos.
# Output: public/og-images/<OUTPUT_FILENAME>.jpg, cropped to 1200x630.

set -e

VIDEO_ID="$1"
OUTPUT="$2"
HASH="$3"

if [ -z "$VIDEO_ID" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: $0 VIDEO_ID OUTPUT_FILENAME [HASH]"
  exit 1
fi

VIMEO_URL="https://vimeo.com/${VIDEO_ID}"
if [ -n "$HASH" ]; then
  VIMEO_URL="https://vimeo.com/${VIDEO_ID}/${HASH}"
fi

OEMBED="https://vimeo.com/api/oembed.json?url=${VIMEO_URL}&width=1200"
THUMB_URL=$(curl -s "$OEMBED" | jq -r '.thumbnail_url' | sed 's/_960/_1280/')

if [ -z "$THUMB_URL" ] || [ "$THUMB_URL" = "null" ]; then
  echo "Failed to fetch thumbnail for video ${VIDEO_ID}. Is it private without a hash?" >&2
  exit 1
fi

mkdir -p public/og-images
RAW="public/og-images/${OUTPUT}.raw.jpg"
OUT="public/og-images/${OUTPUT}.jpg"

curl -s -o "$RAW" "$THUMB_URL"
ffmpeg -y -i "$RAW" -vf "scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630" -q:v 2 "$OUT" 2>/dev/null
rm -f "$RAW"

echo "Saved $OUT"

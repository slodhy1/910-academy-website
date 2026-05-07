#!/bin/bash
# Fails if any gated draft page accidentally lands in public/products/.
# Add new gated pages here as we build them.

set -e

GATED_PAGES=(
)

FAILED=0
for page in "${GATED_PAGES[@]}"; do
  if [ -f "$page" ]; then
    echo "ERROR: $page exists in public/products/ but should be in public/_drafts/"
    echo "       Move it back: git mv $page public/_drafts/$(basename $page)"
    FAILED=1
  fi
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "Gated page exposure prevented. Refusing to build."
  exit 1
fi

echo "All gated pages confirmed in _drafts/. Safe to deploy."

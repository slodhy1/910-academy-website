#!/bin/bash
# Print actual Vimeo title + duration for every product video ID we've used.
# Use this to spot ID-to-purpose mismatches before they ship.

VIDEOS=(
  "1088559714:Lucid Horizon full workshop (claimed ~1.5hr)"
  "1090852657:Lucid Horizon trailer"
  "1075782631:Known Productions full workshop"
  "1044727032:JT Visuals full workshop"
  "1167927978:Four Horsemen Part 1 full workshop"
  "1172242879:Four Horsemen Part 2 full workshop"
  "1165865703:Four Horsemen combined trailer"
  "1170793578:Instagram Masterclass main workshop (claimed ~1.5hr)"
  "1172362926:Build Your Instagram (formerly secondary)"
  "1098236606:910 Admin Assistant trailer"
  "1064864940:910 Sales System workshop"
  "1059797444:3D Made Easy workshop"
)

printf "%-12s | %-55s | %-40s | %s\n" "Vimeo ID" "Claimed Purpose" "Title in Vimeo" "Duration"
printf "%s\n" "-------------|---------------------------------------------------------|------------------------------------------|---------"

for entry in "${VIDEOS[@]}"; do
  ID="${entry%%:*}"
  PURPOSE="${entry#*:}"

  # Try without hash first, then with no result fall back to "needs hash" hint.
  RESULT=$(curl -s "https://vimeo.com/api/oembed.json?url=https://vimeo.com/${ID}")
  TITLE=$(echo "$RESULT" | jq -r '.title // empty' 2>/dev/null)
  DURATION_SEC=$(echo "$RESULT" | jq -r '.duration // 0' 2>/dev/null)

  if [ -z "$TITLE" ]; then
    TITLE="(needs hash or not accessible)"
    DURATION_MIN="—"
  else
    DURATION_MIN=$(echo "scale=1; $DURATION_SEC / 60" | bc)" min"
  fi

  printf "%-12s | %-55s | %-40s | %s\n" "$ID" "$PURPOSE" "$TITLE" "$DURATION_MIN"
done

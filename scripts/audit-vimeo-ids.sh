#!/bin/bash
# scripts/audit-vimeo-ids.sh
# Audits Vimeo IDs against actual video metadata.
# Format per entry: "ID:Purpose:Hash" (Hash optional for public videos)

VIDEOS=(
  "1088559714:Lucid Horizon full workshop:a95a1435cb"
  "1090852657:Lucid Horizon trailer:"
  "1075782631:Known Productions full workshop:63baf05123"
  "1044727032:JT Visuals full workshop:93df7b2c46"
  "1167927978:Four Horsemen Part 1 full workshop:"
  "1172242879:Four Horsemen Part 2 full workshop:"
  "1165865703:Four Horsemen combined trailer:"
  "1170793578:Instagram Masterclass main workshop:"
  "1172362926:Build Your Instagram (formerly secondary):"
  "1098236606:910 Admin Assistant trailer:"
  "1064864940:910 Sales System workshop:e337e0c27e"
  "1059797444:3D Made Easy workshop:c7004cd446"
)

echo "Vimeo ID    | Claimed Purpose                                 | Title in Vimeo                          | Duration"
echo "------------|-------------------------------------------------|-----------------------------------------|----------"

for entry in "${VIDEOS[@]}"; do
  IFS=':' read -r ID PURPOSE HASH <<< "$entry"

  if [ -n "$HASH" ]; then
    URL="https://vimeo.com/${ID}/${HASH}"
  else
    URL="https://vimeo.com/${ID}"
  fi

  RESULT=$(curl -s "https://vimeo.com/api/oembed.json?url=${URL}")
  TITLE=$(echo "$RESULT" | jq -r '.title // "ERROR / private"')
  DURATION_SEC=$(echo "$RESULT" | jq -r '.duration // 0')

  if [ "$DURATION_SEC" = "0" ] || [ -z "$DURATION_SEC" ]; then
    DURATION_DISPLAY="—"
  else
    DURATION_DISPLAY="$(echo "scale=1; $DURATION_SEC / 60" | bc) min"
  fi

  printf "%-12s| %-48s| %-40s| %s\n" "$ID" "$PURPOSE" "$TITLE" "$DURATION_DISPLAY"
done

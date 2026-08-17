#!/bin/bash
outdir="$1"
if [ -z "$outdir" ]; then outdir="_site"; fi
rm -rf "$outdir"
mkdir -p "$outdir"
buildPlugin() {
  f=$1
  dir=$(dirname "$f")
  plugin_id=$(basename "$f" .yml)
  echo "Processing $plugin_id"
  zipfile="$outdir/$plugin_id.zip"
  (cd "$dir" || exit 1; zip -r "$zipfile" . -x "*.git*" > /dev/null)
  name=$(grep "^name:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' )
  description=$(grep "^description:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' )
  ymlVersion=$(grep "^version:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' )
  updated=$(date -u +"%Y-%m-%d %H:%M:%S")
  echo "- id: $plugin_id
  name: $name
  metadata:
    description: $description
  version: $ymlVersion
  date: $updated
  path: $plugin_id.zip
  sha256: $(sha256sum "$zipfile" | cut -d' ' -f1)" >> "$outdir/index.yml"
  echo "" >> "$outdir/index.yml"
}
find ./plugins -mindepth 2 -name "*.yml" | while read -r file; do buildPlugin "$file"; done
echo "Built index.yml"

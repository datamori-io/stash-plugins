#!/bin/bash
# AGPLv3.0
# builds a repository of plugins and scrapers
# outputs to _site with the following structure:
# index.yml                 # plugins
# <plugin_id>.zip
# scrapers/index.yml        # scrapers (Stash Metadata Providers source)
# scrapers/<scraper_id>.zip

outdir="$1"
if [ -z "$outdir" ]; then
    outdir="_site"
fi

rm -rf "$outdir"
mkdir -p "$outdir"
mkdir -p "$outdir/scrapers"

buildPlugin()
{
    f=$1
    dir=$(dirname "$f")
    plugin_id=$(basename "$f" .yml)

    echo "Processing plugin $plugin_id"

    version=$(git log -n 1 --pretty=format:%h -- "$dir"/* 2>/dev/null || echo "dev")
    updated=$(TZ=UTC0 git log -n 1 --date="format-local:%F %T" --pretty=format:%ad -- "$dir"/* 2>/dev/null || date -u +"%Y-%m-%d %H:%M:%S")

    zipfile=$(realpath "$outdir/$plugin_id.zip")

    pushd "$dir" > /dev/null
    zip -r "$zipfile" . > /dev/null
    popd > /dev/null

    name=$(grep "^name:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' -e 's/^"\(.*\)"$/\1/')
    description=$(grep "^description:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' -e 's/^"\(.*\)"$/\1/')
    ymlVersion=$(grep "^version:" "$f" | head -n 1 | cut -d' ' -f2- | sed -e 's/\r//' -e 's/^"\(.*\)"$/\1/')
    version="$ymlVersion-$version"

    echo "- id: $plugin_id
  name: $name
  metadata:
    description: $description
  version: $version
  date: $updated
  path: $plugin_id.zip
  sha256: $(sha256sum "$zipfile" | cut -d' ' -f1)" >> "$outdir"/index.yml

    echo "" >> "$outdir"/index.yml
}

buildScraper()
{
    f=$1
    dir=$(dirname "$f")
    scraper_id=$(basename "$f" .yml)
    versionFile=$f

    if [ "$scraper_id" == "package" ]; then
        scraper_id=$(basename "$dir")
    fi

    if [ "$dir" != "./scrapers" ]; then
        versionFile="$dir"
    fi

    echo "Processing scraper $scraper_id"

    IFS='|' read -r version updated < <(TZ=UTC0 git log -n 1 --date="format-local:%F %T" --pretty=format:'%h|%ad' -- "$versionFile")
    if [ -z "$version" ]; then
        version="dev"
        updated=$(date -u +"%Y-%m-%d %H:%M:%S")
    fi

    zipfile=$(realpath "$outdir/scrapers/$scraper_id.zip")

    name=$(grep "^name:" "$f" | cut -d' ' -f2- | sed -e 's/\r//' -e 's/^"\(.*\)"$/\1/')
    ignore=$(grep "^# ignore:" "$f" | cut -c 10- | sed -e 's/\r//')
    dep=$(grep "^# requires:" "$f" | cut -c 12- | sed -e 's/\r//')
    ignore="-x $ignore package"

    pushd "$dir" > /dev/null
    if [ "$dir" != "./scrapers" ]; then
        zip -r "$zipfile" . ${ignore} > /dev/null
    else
        zip "$zipfile" "$scraper_id.yml" > /dev/null
    fi
    popd > /dev/null

    echo "- id: $scraper_id
  name: $name
  version: $version
  date: $updated
  path: $scraper_id.zip
  sha256: $(sha256sum "$zipfile" | cut -d' ' -f1)" >> "$outdir"/scrapers/index.yml

    if [ -n "$dep" ]; then
        echo "  requires:" >> "$outdir"/scrapers/index.yml
        for d in ${dep//,/ }; do
            echo "    - $d" >> "$outdir"/scrapers/index.yml
        done
    fi

    echo "" >> "$outdir"/scrapers/index.yml
}

find ./plugins -mindepth 1 -name "*.yml" | while read file; do
    buildPlugin "$file"
done

echo "Built plugin index.yml with $(grep -c '^- id:' "$outdir/index.yml" 2>/dev/null || echo 0) plugins"

shopt -s nullglob
for f in ./scrapers/*.yml; do
    buildScraper "$f"
done
find ./scrapers/ -mindepth 2 -name '*.yml' -print0 | while read -d $'\0' f; do
    buildScraper "$f"
done
find ./scrapers/ -mindepth 2 -name package -print0 | while read -d $'\0' f; do
    buildScraper "$f"
done

echo "Built scraper index.yml with $(grep -c '^- id:' "$outdir/scrapers/index.yml" 2>/dev/null || echo 0) scrapers"

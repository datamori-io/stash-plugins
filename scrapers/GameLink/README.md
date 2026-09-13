# GameLink Stash scraper

YAML scraper for [GameLink.com](https://www.gamelink.com) and [gay.gamelink.com](https://gay.gamelink.com).

## Install from source (preferred)

1. Stash → **Settings → Metadata Providers → Available Scrapers → Add Source**
2. Source URL:

```
https://datamori-io.github.io/stash-plugins/main/scrapers/index.yml
```

3. Install **GameLink** from that source
4. Reload scrapers

## Manual install

Copy `GameLink.yml` into Stash’s scrapers path and reload.

## Use

Paste a GameLink URL on a scene or group and scrape.

```
https://www.gamelink.com/adult-movies/{studio-slug}/{id}/{title-slug}
https://gay.gamelink.com/adult-movies/{studio-slug}/{id}/{title-slug}
https://www.gamelink.com/clip/...
https://www.gamelink.com/porn-stars/{id}/porn-star
```

Age gate cookie: `ageConfirmed=true` on `.gamelink.com`.

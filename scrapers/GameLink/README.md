# GameLink Stash scraper

YAML scraper for [GameLink.com](https://www.gamelink.com) and [gay.gamelink.com](https://gay.gamelink.com).

GameLink is part of the same Ravana / AdultEmpire family as AdultEmpire and AdultDVDEmpire. There is no official CommunityScrapers entry for GameLink.

## Install

Stash scrapers are **not** loaded from the plugin source URL. Copy the YAML into Stash's scrapers directory:

1. Copy `GameLink.yml` into Stash’s scrapers path
   - Docker / typical: `/root/.stash/scrapers/GameLink.yml`
2. Stash → **Settings → Metadata Providers → Reload scrapers**
3. Confirm **GameLink** appears in the installed scrapers list

## Use

Paste a GameLink URL on a scene or group and scrape.

```
https://www.gamelink.com/adult-movies/{studio-slug}/{id}/{title-slug}
https://gay.gamelink.com/adult-movies/{studio-slug}/{id}/{title-slug}
https://www.gamelink.com/clip/...
https://www.gamelink.com/porn-stars/{id}/porn-star
```

Examples:

- https://www.gamelink.com/adult-movies/vivid/1405521/young-nikki-tyler
- https://gay.gamelink.com/adult-movies/colt-studio/2908505/hawaii
- https://gay.gamelink.com/adult-movies/treasure-island-media/4758491/timjack-vol-8-ball-busting

Search by name is also wired (`https://www.gamelink.com/search?q={}`).

## Fields

Title, released date, studio, starring, categories (tags), synopsis, cover, director/duration when present, product id as Code, group from movie pages.

Age gate cookie: `ageConfirmed=true` on `.gamelink.com`.

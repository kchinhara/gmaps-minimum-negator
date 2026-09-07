---
name: gmaps-minimum-negator
description: Google Maps competitor scraper + negative keyword generator. Scrapes nearby businesses from Google Maps using Playwright, then applies the minimum negator algorithm to generate safe phrase match negatives. Zero-cost, no API keys.
metadata:
  version: 1.0.0
---

# GMaps Minimum Negator

Scrapes competitor business names from Google Maps nearby search results, then generates minimum-safe negative keywords using the CH minimum negator algorithm.

Combines the kurama-review-scraper browser stack (Playwright + stealth + anti-detection) with the ch-minimum-negator algorithm (dictionary-based minimum negator + keyword conflict checking).

## Quick Start

```bash
# Install dependencies (first time only)
cd .claude/skills/gmaps-minimum-negator && npm install

# One-time setup: sign into Google for more results per search point
node scripts/scrape-competitors.cjs --setup

# Single point (quick, ~8 results)
node scripts/scrape-competitors.cjs acme-care \
  --business "Acme Home Care" \
  --category "home care" \
  --keywords "home care manchester, care agency, carers manchester"

# Grid search (100s of results, 5km default radius)
node scripts/scrape-competitors.cjs acme-care \
  --business "Acme Home Care" \
  --category "home care" \
  --keywords "home care manchester, care agency" \
  --multi

# Grid search with custom radius
node scripts/scrape-competitors.cjs acme-care \
  --business "Acme Home Care" \
  --category "home care" \
  --keywords "home care manchester, care agency" \
  --multi --radius 10
```

## Triggers

- "scrape Google Maps competitors for [business]"
- "nearby competitor negatives for [client]"
- "Google Maps negative keywords for [business]"
- "gmaps negator for [client]"
- "competitor names from Google Maps"

## Quick Reference

| Flag | Description | Default |
|------|-------------|---------|
| `<client-name>` | Client directory name (required, positional) | - |
| `--business "Name"` | Seed business name to center the search | required* |
| `--category "query"` | Nearby search query (e.g., "home care") | required |
| `--setup` | One-time browser sign-in (boosts results/point) | - |
| `--multi` | Enable multi-point grid search (100s of results) | off |
| `--radius N` | Grid search radius in km | 5 |
| `--grid-spacing N` | Distance between grid points in km | auto** |
| `--location "City"` | Location hint for seed business search | none |
| `--keywords "kw1,kw2"` | Target keywords for conflict checking (auto-fetched from Google Ads API if omitted) | auto |
| `--zoom N` | Zoom level (lower = wider area, more results) | 14 |
| `--lat N --lng N` | Use coordinates directly (skip seed search) | from seed |
| `--no-phone` | Skip phone extraction from place pages (faster) | extract |
| `--debug` | Save screenshots + HTML for troubleshooting | off |
| `--headless` | Run headless (less reliable) | off |
| `--root path` | Override project root directory | auto |
| `--dry-run` | Preview settings without scraping | off |

*Either `--business` or `--lat`/`--lng` is required.
**Auto spacing: 3km if signed-in, 2km if anonymous.

## Live Keyword Conflict Checking

When `--keywords` is omitted, the script automatically fetches live keywords from the Google Ads API for the given client. Only keywords where **campaign, ad group, and keyword are all ENABLED** are fetched. This prevents generating negatives that would block your active traffic.

The lookup uses `google-ads-api/clients-registry.json` to resolve the client slug to an account ID. If the registry or client entry is missing, it falls back gracefully and continues without conflict checking.

You can still override with `--keywords "kw1, kw2"` to use manual keywords instead of the API fetch.

## How It Works

### Single Point (default)
```
1. Launch Chromium (persistent profile + stealth anti-detection)
2. Navigate to Google Maps, handle consent
3. Search for seed business (e.g., "Acme Home Care")
4. Extract lat/lng coordinates from the page URL
5. Navigate to maps/search/{category}/@{lat},{lng},{zoom}z
6. Scroll through results panel to load all listings
7. Extract: name, category, rating, review count, address from list
8. Visit each place page to extract phone number
9. Exclude seed business, deduplicate by name
10. Clean business names (strip Ltd, PLC, parentheticals)
11. Apply minimum negator algorithm (370K-word dictionary)
12. Refine short/conflicting negators
13. Check against user's target keywords for conflicts
14. Save: competitors JSON + CSV, negatives CSV, safe negatives TXT
```

### Grid Search (`--multi`)
```
1-4. Same as above (find seed business, extract center coordinates)
5.   Generate circular grid of lat/lng points around center
6.   For each grid point:
       a. Navigate to maps/search/{category}/@{pt.lat},{pt.lng},{zoom}z
       b. Scroll and extract all results
       c. Deduplicate against master list (by business name)
       d. Random delay between points (10-20s signed-in, 20-40s anonymous)
       e. If CAPTCHA detected, skip point and cool down 60-90s
7.   Merge all unique results
8-14. Same as single point (phones, negators, output)
```

## Grid Search Guide

| Radius | Spacing | Grid Points | Expected Unique Results | Runtime (signed-in) | Runtime (anonymous) |
|--------|---------|-------------|------------------------|---------------------|---------------------|
| 3km | auto | ~7 | 50-150 | ~2-3 min | ~4-6 min |
| 5km | auto | ~13-21 | 100-300 | ~3-5 min | ~7-12 min |
| 10km | auto | ~37-69 | 200-500+ | ~8-15 min | ~15-30 min |

Grid spacing auto-adjusts based on authentication:
- **Signed-in profile**: 3km spacing (each point returns ~20-40 results)
- **Anonymous**: 2km spacing (each point returns ~8-15 results)

### Profile Setup

One-time, takes 2 minutes:
```bash
node scripts/scrape-competitors.cjs --setup
```
1. Browser opens to Google sign-in page
2. Sign into your Google account
3. Visit google.com/maps to confirm
4. Close the browser - session saved to `.playwright-profile/`

The profile persists across runs. Re-auth only needed if Google expires the session (weeks/months).

## Output Files

Saved to `clients/{client}/gmaps-minimum-negator/`:

| File | Contents |
|------|----------|
| `gmaps-competitors_{date}.json` | Full competitor data (name, category, rating, reviews, address, phone, Maps URL) |
| `gmaps-competitors_{date}.csv` | Same data as flat CSV |
| `gmaps-negatives_{date}.csv` | Raw Name, Cleaned Name, Minimum Negator, Blocked Keywords, Source |
| `safe-negatives_{date}.txt` | Ready-to-use negatives (one per line, phrase match) |

## Zoom Level Guide

| Zoom | Approx Radius | Typical Results | Best For |
|------|---------------|-----------------|----------|
| 16 | ~500m | 5-10 | Immediate neighbours only |
| 15 | ~1km | 10-15 | Default "Nearby" radius |
| 14 | ~2km | 20-35 | Good balance (default) |
| 13 | ~5km | 35-60 | Wider area coverage |
| 12 | ~10km | 60-120 | City-level sweep |

Single-point results cap at ~8 (anonymous) or ~40 (signed-in). Use `--multi` for 100s of results via grid search.

## Why This Complements CH Negator

| | CH Negator | GMaps Negator |
|---|---|---|
| Source | Companies House (legal registrations) | Google Maps (physical businesses) |
| Coverage | All UK registered companies by SIC code | Local businesses actively on Maps |
| Includes | Dormant/shell companies with no web presence | Only businesses with Google listings |
| Misses | Sole traders, unregistered businesses | Companies not on Google Maps |
| Best for | Broad UK-wide name blocking | Local competitor name blocking |

Running both gives the most comprehensive negative keyword list.

## Anti-Detection

Same battle-tested stack as kurama-review-scraper:
- Persistent Chrome profile (`.playwright-profile/`) for cookie/trust accumulation
- Stealth plugin (navigator.webdriver removal, WebGL spoofing, etc.)
- Character-by-character typing with random delays (50-150ms)
- Random mouse movements between actions
- Human-like scroll patterns with variable pauses
- User-Agent rotation (6 real Chrome UAs)
- `--disable-blink-features=AutomationControlled` flag

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| CAPTCHA detected | Rate limited or flagged profile | Wait 24h. Delete `.playwright-profile/` if persistent |
| 0 results loaded | Category/zoom mismatch | Try broader category or lower zoom number |
| Can't find seed business | Ambiguous name | Add `--location` for specificity |
| No coordinates extracted | Seed page didn't load properly | Use `--lat`/`--lng` directly |
| Phone extraction slow | Visiting each place page | Use `--no-phone` for speed |
| Browser crash | Profile corrupted | Delete `.playwright-profile/` |

## Configuration

Edit `config.js` to customize:
- **Selectors**: All Google Maps DOM selectors (update when layout changes)
- **Delays**: Typing speed, scroll pauses, click delays
- **User Agents**: Chrome UA rotation pool
- **Defaults**: Zoom level, scroll attempts

## Architecture

```
gmaps-minimum-negator/
  SKILL.md                    # This file
  config.js                   # All configuration + selectors
  package.json                # Dependencies
  .gitignore
  scripts/
    scrape-competitors.cjs    # Main script (CLI entry point)
  .playwright-profile/        # Persistent browser profile (gitignored)
```

Dictionary: `<repo-root>/resources/words.txt` (370K words, shared with ch-minimum-negator)
Locations: `<repo-root>/.claude/skills/ch-minimum-negator/data/locations.txt` (2,730 UK locations, optional)

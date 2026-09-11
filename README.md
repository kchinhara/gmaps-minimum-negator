# GMaps Minimum Negator

Zero-cost Google Maps competitor scraper + negative keyword generator. Scrapes nearby businesses from Google Maps using a real Chromium browser via [Playwright](https://playwright.dev), then generates safe phrase match negatives using a dictionary-based minimum negator algorithm.

Built for PPC campaign hygiene - find every competitor name in your area and block them from triggering your ads, without blocking your own keywords.

## Why This Exists

Manual competitor name research on Google Maps returns 8-10 results per search. This tool automates a multi-point grid search across your service area and extracts hundreds of unique competitor names, then generates the minimum-safe negative keyword for each one.

| | Manual Research | GMaps Minimum Negator |
|---|---|---|
| **Results per run** | 8-10 | 300-500+ |
| **Coverage** | Single search point | Grid search across service area |
| **Negatives** | Copy-paste names | Minimum-safe phrase match negatives |
| **Conflict checking** | Manual | Automated against your keywords |
| **Phone numbers** | Click each listing | Batch extracted |
| **Cost** | Hours of manual work | ~8 minutes |

## Quick Start

```bash
# Install dependencies
npm install

# One-time setup: sign into Google for more results per search point
node scripts/scrape-competitors.cjs --setup

# Single point (quick, ~8 results)
node scripts/scrape-competitors.cjs my-client \
  --business "My Business Name" \
  --category "home care"

# Grid search (300+ results, 5km default radius)
node scripts/scrape-competitors.cjs my-client \
  --business "My Business Name" \
  --location "Manchester, UK" \
  --category "home care" \
  --keywords "home care manchester, care agency" \
  --multi

# Grid search with custom radius
node scripts/scrape-competitors.cjs my-client \
  --business "My Business Name" \
  --category "plumber" \
  --multi --radius 10
```

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `<client-name>` | Client directory name (positional, required) | - |
| `--business "Name"` | Seed business to find on Google Maps | required* |
| `--category "query"` | Nearby search query (e.g., "home care") | required |
| `--setup` | One-time browser sign-in (boosts results/point) | - |
| `--multi` | Enable multi-point grid search (300+ results) | off |
| `--radius N` | Grid search radius in km | 5 |
| `--grid-spacing N` | Distance between grid points in km | auto** |
| `--location "City"` | Location hint for seed business search | none |
| `--keywords "kw1,kw2"` | Target keywords for conflict checking | none |
| `--zoom N` | Zoom level (lower = wider area) | 14 |
| `--lat N --lng N` | Use coordinates directly (skip seed search) | from seed |
| `--no-phone` | Skip phone extraction (faster) | extract |
| `--debug` | Save screenshots + HTML for troubleshooting | off |
| `--headless` | Run headless (less reliable) | off |
| `--root path` | Override project root directory | auto |
| `--dry-run` | Preview settings without scraping | off |

\*Either `--business` or `--lat`/`--lng` is required.
\*\*Auto spacing: 3km if signed-in, 2km if anonymous.

## Output

Files are saved to `clients/{client}/gmaps-minimum-negator/`:

| File | Contents |
|------|----------|
| `gmaps-competitors_{date}.json` | Full competitor data (name, category, rating, reviews, address, phone, Maps URL) |
| `gmaps-competitors_{date}.csv` | Same data as flat CSV |
| `gmaps-negatives_{date}.csv` | Raw Name, Cleaned Name, Minimum Negator, Blocked Keywords, Source |
| `safe-negatives_{date}.txt` | Ready-to-use negatives (one per line, phrase match format) |

### What You Get

- **Competitor data** - name, Google Maps category, star rating, review count, address, phone number, direct Maps URL
- **Minimum negators** - the shortest phrase that uniquely identifies each competitor without being a real English word
- **Conflict checking** - negatives are checked against your target keywords to prevent blocking your own traffic
- **Phone numbers** - extracted from individual place pages (useful for competitive intelligence)

## How It Works

### Single Point (default)

1. Launch Chromium with persistent profile + stealth anti-detection
2. Navigate to Google Maps, handle cookie consent
3. Search for seed business (e.g., "Acme Home Care, Stockport, UK")
4. Extract lat/lng coordinates from the Maps URL
5. Navigate to `maps/search/{category}/@{lat},{lng},{zoom}z`
6. Scroll through results using `scrollIntoViewIfNeeded()` to load all listings
7. Extract: name, category, rating, review count, address from the list DOM
8. Visit each place page to extract phone number
9. Exclude seed business, deduplicate by name
10. Clean business names (strip Ltd, PLC, CIC, parentheticals)
11. Apply minimum negator algorithm against a 370K-word English dictionary
12. Check against user's target keywords for conflicts
13. Save competitors JSON + CSV, negatives CSV, safe negatives TXT

### Grid Search (`--multi`)

1-4. Same as above (find seed business, extract centre coordinates)
5. Generate a circular grid of lat/lng points around the centre
6. For each grid point:
   - Navigate to `maps/search/{category}/@{pt.lat},{pt.lng},{zoom}z`
   - Scroll and extract all results (96-120 per point when signed in)
   - Deduplicate against master list by business name
   - Random delay between points (10-20s signed-in, 20-40s anonymous)
   - If CAPTCHA detected, skip point and cool down 60-90s
7. Merge all unique results
8-13. Same as single point (phones, negators, conflict check, output)

## Grid Search Guide

| Radius | Spacing | Grid Points | Expected Unique Results | Runtime (signed-in) |
|--------|---------|-------------|------------------------|---------------------|
| 3km | auto | ~7 | 50-150 | ~2-3 min |
| 5km | auto | ~9-13 | 200-400 | ~5-9 min |
| 10km | auto | ~37-69 | 400-600+ | ~10-20 min |

Grid spacing auto-adjusts based on authentication:
- **Signed-in profile**: 3km spacing (~96-120 results/point)
- **Anonymous**: 2km spacing (~8-15 results/point)

### Profile Setup

One-time, takes 2 minutes:

```bash
node scripts/scrape-competitors.cjs --setup
```

1. Browser opens to Google sign-in page
2. Sign into your Google account
3. Visit google.com/maps to confirm
4. Close the browser - session saved to `.playwright-profile/`

The profile persists across runs. Re-auth only needed if Google expires the session.

## The Minimum Negator Algorithm

The core insight: you do not need to add a competitor's full name as a negative keyword. You need the **shortest unique phrase** that identifies them without matching real search queries.

For "Acacia Homecare Stockport & Manchester":
- `"acacia"` would work, but "acacia" is a real English word (a type of tree) - someone searching for acacia wood furniture would be blocked
- `"acacia homecare"` is not a dictionary word/phrase - safe to use as a phrase match negative

The algorithm:
1. Clean the business name (strip Ltd, PLC, parentheticals, normalise)
2. Split into words
3. Test progressively longer phrases starting from the first word
4. Check each phrase against a 370,105-word English dictionary + 2,730 UK location names
5. The first phrase that is NOT a real word/location = the minimum negator
6. Check the negator does not conflict with any of your target keywords

## Anti-Detection

Same battle-tested stack as [kurama-review-scraper](https://github.com/kchinhara/kurama-review-scraper):

- **Persistent browser profile** - cookie/trust accumulation across sessions
- **Stealth plugin** - `navigator.webdriver` removal, WebGL spoofing
- **Human-like typing** - character-by-character with random 50-150ms delays
- **Random mouse movements** between actions
- **Variable scroll pauses** - no robotic timing patterns
- **User-Agent rotation** - pool of 6 real Chrome UAs
- **Automation flag disabled** - `--disable-blink-features=AutomationControlled`

## Configuration

All settings live in `config.js`:

- **Selectors** - Google Maps DOM selectors with multi-fallback chains
- **Delays** - typing speed, scroll pauses, click delays, grid point delays
- **User Agents** - Chrome UA rotation pool
- **Grid defaults** - radius, spacing, CAPTCHA thresholds
- **Corporate identifiers** - regex for stripping Ltd, PLC, etc. from names

When Google Maps changes its layout, update the selectors in `config.js` - no need to touch the scraper code.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| CAPTCHA detected | Rate limited or flagged profile | Wait 24h. Delete `.playwright-profile/` if persistent |
| 0 results loaded | Category/zoom mismatch | Try broader category or lower zoom number |
| Wrong seed business | Ambiguous name | Add `--location` for specificity |
| No coordinates extracted | Seed page did not load properly | Use `--lat`/`--lng` directly |
| Phone extraction slow | Visiting each place page | Use `--no-phone` for speed |
| Browser crash | Profile corrupted | Delete `.playwright-profile/` |

## Complementary Tools

This tool focuses on **local businesses actively on Google Maps**. For broader coverage, combine with:

| Tool | Source | Coverage |
|------|--------|----------|
| **GMaps Minimum Negator** | Google Maps nearby search | Local businesses with Google listings |
| **CH Minimum Negator** | Companies House registrations | All UK registered companies by SIC code |

Running both gives the most comprehensive negative keyword list.

## Project Structure

```
gmaps-minimum-negator/
  config.js                   # All configuration + selectors
  package.json                # Dependencies (playwright, stealth)
  SKILL.md                    # Claude Code skill definition
  scripts/
    scrape-competitors.cjs    # Main script (CLI entry point)
  .playwright-profile/        # Persistent browser profile (gitignored)
```

Dictionary: `resources/words.txt` (370K words, shared resource)
Locations: `data/locations.txt` (2,730 UK locations, optional)

## License

MIT

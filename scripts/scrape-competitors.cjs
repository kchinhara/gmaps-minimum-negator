#!/usr/bin/env node
/**
 * GMaps Minimum Negator - Google Maps Competitor Scraper + Negative Keyword Generator
 *
 * Scrapes competitor business names from Google Maps nearby search results,
 * then generates minimum-safe negative keywords using the CH minimum negator algorithm.
 *
 * Built by Kuda Chinhara | Agentic PPC Ads
 * https://agenticppcads.com
 *
 * Usage:
 *   node scripts/scrape-competitors.cjs <client> --business "Name" --category "query" [options]
 *
 * Options:
 *   --business "Name"        Seed business name (to find center coordinates)
 *   --category "query"       Nearby search query (e.g., "home care")
 *   --location "City, UK"    Location hint for seed search
 *   --keywords "kw1,kw2"     Target keywords to check for conflicts
 *   --zoom N                 Zoom level: lower = wider area, more results (default: 14)
 *   --lat N --lng N          Skip seed search, use these coordinates directly
 *   --no-phone               Skip phone extraction from place pages
 *   --debug                  Save screenshots + HTML for troubleshooting
 *   --headless               Run headless (less reliable)
 *   --root <path>            Override project root directory
 *   --dry-run                Preview settings without scraping
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const config = require('../config');

// ============================================================
// CONSTANTS
// ============================================================

const SKILL_ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(SKILL_ROOT, '.playwright-profile');

// ============================================================
// CLI ARGUMENT PARSING
// ============================================================

function findRepoRoot() {
  let dir = path.resolve(__dirname, '..');
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    clientName: null,
    business: null,
    category: null,
    location: null,
    keywords: [],
    zoom: config.defaults.zoom,
    lat: null,
    lng: null,
    debug: config.defaults.debug,
    headless: false,
    noPhone: false,
    root: findRepoRoot(),
    dryRun: false,
    multi: false,
    radius: config.defaults.gridRadiusKm,
    gridSpacing: null,
    setup: false,
  };

  // First positional arg is client name
  if (args.length > 0 && !args[0].startsWith('--')) {
    parsed.clientName = args[0];
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--business': parsed.business = args[++i]; break;
      case '--category': parsed.category = args[++i]; break;
      case '--location': parsed.location = args[++i]; break;
      case '--keywords':
        parsed.keywords = (args[++i] || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        break;
      case '--zoom': parsed.zoom = parseInt(args[++i], 10) || config.defaults.zoom; break;
      case '--lat': parsed.lat = parseFloat(args[++i]); break;
      case '--lng': parsed.lng = parseFloat(args[++i]); break;
      case '--debug': parsed.debug = true; break;
      case '--headless': parsed.headless = true; break;
      case '--no-phone': parsed.noPhone = true; break;
      case '--root': parsed.root = path.resolve(args[++i]); break;
      case '--dry-run': parsed.dryRun = true; break;
      case '--multi': parsed.multi = true; break;
      case '--radius': parsed.radius = parseFloat(args[++i]) || config.defaults.gridRadiusKm; break;
      case '--grid-spacing': parsed.gridSpacing = parseFloat(args[++i]); break;
      case '--setup': parsed.setup = true; break;
      case '--help': showHelp(); process.exit(0);
      default:
        if (!args[i].startsWith('--') && !parsed.clientName) {
          parsed.clientName = args[i];
        }
    }
  }

  if (parsed.setup) return parsed;

  if (!parsed.clientName) {
    console.error('Error: Client name required (first positional argument)');
    showHelp();
    process.exit(1);
  }
  if (!parsed.business && (parsed.lat == null || parsed.lng == null)) {
    console.error('Error: Provide --business "Name" or both --lat and --lng');
    process.exit(1);
  }
  if (!parsed.category) {
    console.error('Error: --category "search term" is required');
    process.exit(1);
  }

  return parsed;
}

function showHelp() {
  console.log(`
GMaps Minimum Negator - Google Maps Competitor Scraper + Negative Keyword Generator

Usage:
  node scripts/scrape-competitors.cjs <client-name> --business "Name" --category "query" [options]
  node scripts/scrape-competitors.cjs --setup

Required:
  <client-name>              Client directory name
  --business "Name"          Seed business to find on Google Maps (or use --lat/--lng)
  --category "query"         Nearby search query (e.g., "home care", "plumber")

Grid Search (get 100s of results):
  --multi                    Enable multi-point grid search
  --radius <km>              Search radius in km (default: ${config.defaults.gridRadiusKm})
  --grid-spacing <km>        Distance between grid points (default: auto - 3km signed-in, 2km anonymous)

Setup:
  --setup                    Open browser for one-time Google sign-in (boosts results/point from ~8 to ~40)

Options:
  --location "City, UK"      Location hint for seed business search
  --keywords "kw1,kw2"       Target keywords to check for conflicts
  --zoom <N>                 Zoom level (default: ${config.defaults.zoom}). Lower = wider area = more results
  --lat <N> --lng <N>        Skip seed search, use coordinates directly
  --no-phone                 Skip phone extraction (faster)
  --debug                    Save debug screenshots and HTML
  --headless                 Run browser in headless mode (less reliable)
  --root <path>              Override project root directory
  --dry-run                  Show config without scraping
  --help                     Show this help

Examples:
  # One-time setup (sign into Google for more results per point)
  node scripts/scrape-competitors.cjs --setup

  # Single point (quick, ~8 results)
  node scripts/scrape-competitors.cjs acme-care --business "Acme Home Care" --category "home care"

  # Grid search (100s of results, 5km default radius)
  node scripts/scrape-competitors.cjs acme-care --business "Acme Home Care" --category "home care" --multi

  # Grid search with custom radius and keywords
  node scripts/scrape-competitors.cjs acme-care --business "Acme Home Care" --category "home care" --multi --radius 10 --keywords "home care manchester, care agency"
`);
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function timestamp() {
  return new Date().toISOString().split('T')[0];
}

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] ${msg}`);
}

function logWarn(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.warn(`[${ts}] WARN: ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.error(`[${ts}] ERROR: ${msg}`);
}

/**
 * Try multiple selectors in order, return the first match
 */
async function trySelectors(page, selectorList, options = {}) {
  const { timeout = 3000, state = 'visible' } = options;
  for (const sel of selectorList) {
    try {
      const el = page.locator(sel).first();
      await el.waitFor({ state, timeout });
      return el;
    } catch {
      // Try next selector
    }
  }
  return null;
}

// ============================================================
// ANTI-DETECTION & HUMAN-LIKE BEHAVIOR
// ============================================================

async function typeHumanLike(page, locator, text) {
  await locator.click();
  await sleep(randomDelay(200, 500));
  for (const char of text) {
    await page.keyboard.type(char, {
      delay: randomDelay(config.delays.typingMin, config.delays.typingMax),
    });
  }
}

async function randomMouseMove(page) {
  const x = randomDelay(200, 800);
  const y = randomDelay(150, 500);
  const steps = randomDelay(5, 12);
  await page.mouse.move(x, y, { steps });
  await sleep(randomDelay(config.delays.mouseMovePauseMin, config.delays.mouseMovePauseMax));
}

async function scrollElement(page, element, pixels) {
  await element.evaluate((el, px) => {
    el.scrollBy({ top: px, behavior: 'smooth' });
  }, pixels);
}

// ============================================================
// BROWSER MANAGEMENT
// ============================================================

async function launchBrowser(headless = false) {
  let chromium;

  try {
    const { chromium: chromiumExtra } = require('playwright-extra');
    const stealth = require('puppeteer-extra-plugin-stealth');
    chromiumExtra.use(stealth());
    chromium = chromiumExtra;
    log('Stealth plugin loaded');
  } catch {
    logWarn('playwright-extra/stealth not available, using plain playwright');
    const pw = require('playwright');
    chromium = pw.chromium;
  }

  const ua = config.userAgents[Math.floor(Math.random() * config.userAgents.length)];

  log(`Launching browser (headless: ${headless})`);
  log(`Profile: ${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
    ],
    userAgent: ua,
    viewport: { width: 1366, height: 768 },
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    permissions: ['geolocation'],
    geolocation: { latitude: 51.5074, longitude: -0.1278 },
    ignoreHTTPSErrors: true,
  });

  const page = context.pages()[0] || await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return { context, page };
}

// ============================================================
// GOOGLE MAPS NAVIGATION
// ============================================================

async function handleConsent(page) {
  log('Checking for consent dialog...');
  await sleep(2000);

  if (page.url().includes('consent.google')) {
    log('Consent page detected, accepting...');
    const acceptBtn = await trySelectors(page, config.selectors.consentAccept, { timeout: 5000 });
    if (acceptBtn) {
      await acceptBtn.click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      log('Consent accepted, waiting for Maps to load...');
      await sleep(3000);
      if (!page.url().includes('google.com/maps')) {
        log('Re-navigating to Google Maps after consent...');
        await page.goto('https://www.google.com/maps', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await sleep(3000);
      }
    }
    return;
  }

  const acceptBtn = await trySelectors(page, config.selectors.consentAccept, { timeout: 3000 });
  if (acceptBtn) {
    log('Consent overlay detected, accepting...');
    await acceptBtn.click();
    await sleep(3000);
    log('Consent accepted');
  } else {
    log('No consent dialog found');
  }
}

async function checkForCaptcha(page) {
  const url = page.url();
  if (url.includes('sorry') || url.includes('captcha')) return true;

  const hasCaptcha = await page.evaluate(() => {
    const text = (document.body?.innerText || '').toLowerCase();
    return text.includes('unusual traffic') ||
           text.includes('not a robot') ||
           !!document.querySelector('iframe[src*="recaptcha"]');
  }).catch(() => false);

  return hasCaptcha;
}

/**
 * Search for the seed business on Google Maps and land on its place page
 */
async function searchSeedBusiness(page, business, location) {
  const query = location ? `${business}, ${location}` : business;
  log(`Navigating to Google Maps...`);

  await page.goto('https://www.google.com/maps', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  await handleConsent(page);

  if (await checkForCaptcha(page)) {
    throw new Error('CAPTCHA detected. Wait 24h before retrying. Delete .playwright-profile/ if persistent.');
  }

  log('Waiting for search box...');
  const searchBox = await trySelectors(page, config.selectors.searchBox, { timeout: 15000 });
  if (!searchBox) {
    throw new Error('Search box not found. Google Maps layout may have changed.');
  }

  // Clear existing text
  await searchBox.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await sleep(randomDelay(300, 600));

  log(`Searching for seed: "${query}"`);
  await typeHumanLike(page, searchBox, query);
  await sleep(randomDelay(500, 1000));
  await page.keyboard.press('Enter');

  log('Waiting for results...');
  await sleep(randomDelay(config.delays.afterSearchMin, config.delays.afterSearchMax));

  if (await checkForCaptcha(page)) {
    throw new Error('CAPTCHA detected after search. Wait 24h before retrying.');
  }

  // Check if we landed on a place page or got multiple results. NOTE: the businessTitle
  // selector also matches the multi-result list header, whose text is literally "Results"
  // - a generic seed name returns a results list, not a single place. Treat that header as
  // "not landed" so we fall through to result selection below.
  const titleEl = await trySelectors(page, config.selectors.businessTitle, { timeout: 5000 });
  if (titleEl) {
    const title = (await titleEl.textContent().catch(() => '') || '').trim();
    if (title && !/^results$/i.test(title)) { log(`Seed business found: "${title}"`); return; }
    if (/^results$/i.test(title)) log('Results list detected (not a single place) - selecting best match...');
  }

  // Multiple results - click the best match
  log('Multiple results, selecting best match...');
  const resultItems = await page.locator('[role="feed"] a[aria-label], .Nv2PK a[aria-label]').all();

  if (resultItems.length === 0) {
    const altItems = await page.locator('a.hfpxzc').all();
    if (altItems.length > 0) {
      await randomMouseMove(page);
      await altItems[0].click();
      await sleep(randomDelay(3000, 5000));
      return;
    }
    throw new Error(`Seed business "${business}" not found on Google Maps.`);
  }

  // Best match by aria-label, robust to spacing/punctuation/case (a run-together query
  // like "Olivetreecreative" must still match the listing "Olive Tree Creative").
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const target = norm(business);
  const tWords = new Set((business.toLowerCase().match(/[a-z0-9]+/g)) || []);

  let bestMatch = null, bestScore = 0, bestLabel = '';
  for (const item of resultItems) {
    const label = (await item.getAttribute('aria-label').catch(() => '')) || '';
    const cand = norm(label);
    if (!cand || !target) continue;
    let score = 0;
    if (cand === target) score = 3;                                       // exact (normalised)
    else if (cand.includes(target) || target.includes(cand)) score = 2;   // containment either way
    else {                                                                // token-overlap fallback
      const cWords = (label.toLowerCase().match(/[a-z0-9]+/g)) || [];
      const overlap = cWords.filter((w) => tWords.has(w)).length;
      if (overlap) score = 1 + (overlap / Math.max(tWords.size, 1)) * 0.5; // 1..1.5
    }
    if (score > bestScore) { bestScore = score; bestMatch = item; bestLabel = label; }
  }

  if (bestMatch) {
    log(`Matched (score ${bestScore.toFixed(2)}): "${bestLabel}"`);
  } else {
    bestMatch = resultItems[0];
    bestLabel = (await bestMatch.getAttribute('aria-label').catch(() => '')) || '';
    log(`No name match, using first result: "${bestLabel}"`);
  }

  await randomMouseMove(page);
  await bestMatch.click();
  await sleep(randomDelay(3000, 5000));
}

/**
 * Extract lat/lng coordinates from the current Google Maps URL
 */
function extractCoordsFromUrl(url) {
  const match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),(\d+\.?\d*)z/);
  if (match) {
    return {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2]),
      zoom: parseFloat(match[3]),
    };
  }

  // Fallback: try !2d and !3d params in the data portion
  const dMatch = url.match(/!3d(-?\d+\.?\d*).*?!2d(-?\d+\.?\d*)/);
  if (dMatch) {
    return { lat: parseFloat(dMatch[1]), lng: parseFloat(dMatch[2]), zoom: 15 };
  }
  const d2Match = url.match(/!2d(-?\d+\.?\d*).*?!3d(-?\d+\.?\d*)/);
  if (d2Match) {
    return { lat: parseFloat(d2Match[2]), lng: parseFloat(d2Match[1]), zoom: 15 };
  }

  return null;
}

// ============================================================
// NEARBY SEARCH + RESULT SCROLLING
// ============================================================

/**
 * Navigate to a Google Maps search URL centered on coordinates
 */
async function navigateToNearbySearch(page, category, lat, lng, zoom) {
  const query = encodeURIComponent(category);
  const url = `https://www.google.com/maps/search/${query}/@${lat},${lng},${zoom}z`;

  log(`Navigating to nearby search: "${category}" at [${lat}, ${lng}] zoom=${zoom}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(randomDelay(3000, 5000));

  if (await checkForCaptcha(page)) {
    throw new Error('CAPTCHA detected during nearby search.');
  }

  // Verify we have results
  const hasResults = await page.locator('a.hfpxzc').count();
  if (hasResults === 0) {
    // Wait a bit more - sometimes results take time to appear
    await sleep(3000);
    const retryCount = await page.locator('a.hfpxzc').count();
    if (retryCount === 0) {
      throw new Error(`No results found for "${category}" near [${lat}, ${lng}]. Try a different category or zoom level.`);
    }
  }

  log(`Initial results visible: ${await page.locator('a.hfpxzc').count()}`);
}

/**
 * Dismiss interstitials (sign-in prompts, promo banners) that sit in the results feed
 */
async function dismissInterstitials(page) {
  const dismissed = await page.evaluate(() => {
    let found = false;

    // 1. Click close/dismiss buttons
    const buttons = document.querySelectorAll('button');
    const dismissTexts = ['not now', 'no thanks', 'maybe later', 'skip', 'got it', 'dismiss'];
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').toLowerCase().trim();
      if (label.includes('close') || dismissTexts.includes(text)) {
        btn.click();
        found = true;
      }
    }

    // 2. Click close icons
    const closeSelectors = ['[aria-label="Close"]', '[aria-label="Dismiss"]', '.BRPJ0d'];
    for (const sel of closeSelectors) {
      document.querySelectorAll(sel).forEach(el => { el.click(); found = true; });
    }

    // 3. Scroll interstitial cards out of the way by clicking past them
    // NOTE: Do NOT hide feed children via style.display='none' - this breaks
    // Google Maps' internal DOM tracking and causes all results to vanish.
    // The scrollIntoViewIfNeeded() approach in scrollAndLoadResults handles
    // scrolling past interstitials naturally.

    return found;
  });

  if (dismissed) {
    log('  Dismissed interstitials');
    await sleep(1000);
  }
}

/**
 * Scroll through the results panel to load all available results.
 * Uses scrollIntoViewIfNeeded() on the last result link as the primary technique,
 * because the visible scroll panel (div.m6QErb.DxyBCb) is NOT the actual scroll
 * container - programmatic scrollBy() on it does nothing. scrollIntoViewIfNeeded()
 * lets the browser figure out which container to scroll.
 */
async function scrollAndLoadResults(page) {
  log('Scrolling to load all results...');

  // Verify results exist
  const initial = await page.locator('a.hfpxzc').count();
  if (initial === 0) {
    logWarn('No results found to scroll');
    return;
  }

  let previousCount = 0;
  let stableRounds = 0;

  for (let i = 0; i < config.defaults.maxScrollAttempts; i++) {
    const currentCount = await page.locator('a.hfpxzc').count();

    if (currentCount === previousCount) {
      stableRounds++;

      // NOTE: dismissInterstitials removed from scroll loop - clicking close/dismiss
      // buttons causes Google Maps to re-render the feed and wipe all results.
      // scrollIntoViewIfNeeded() naturally scrolls past interstitial cards.

      // After 3 stable rounds with no new results, try mouse wheel as fallback
      if (stableRounds === 3) {
        try {
          const lastEl = page.locator('a.hfpxzc').last();
          const box = await lastEl.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y);
            await page.mouse.wheel(0, 500);
            await sleep(2000);
          }
        } catch {}
        continue;
      }

      if (stableRounds >= 5) {
        log(`Results stable at ${currentCount} after ${stableRounds} rounds`);
        break;
      }
    } else {
      stableRounds = 0;
    }
    previousCount = currentCount;

    // Check for end of list
    const reachedEnd = await page.evaluate(() => {
      const all = document.querySelectorAll('span, p');
      for (const s of all) {
        const t = (s.textContent || '').toLowerCase();
        if (t.includes("you've reached the end") || t.includes('no more results')) {
          return true;
        }
      }
      return false;
    });

    if (reachedEnd) {
      log(`End of list reached at ${currentCount} results`);
      break;
    }

    // Primary scroll: scrollIntoViewIfNeeded on the last result
    try {
      const lastResult = page.locator('a.hfpxzc').last();
      await lastResult.scrollIntoViewIfNeeded({ timeout: 3000 });
    } catch {
      // Fallback: mouse wheel
      try {
        const panel = await trySelectors(page, config.selectors.scrollablePanel, { timeout: 2000 });
        if (panel) {
          const box = await panel.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.wheel(0, 400);
          }
        }
      } catch {}
    }

    await sleep(randomDelay(config.defaults.scrollPauseMin, config.defaults.scrollPauseMax));

    if (i > 0 && i % 10 === 0) {
      process.stdout.write(`  Scrolling... ${currentCount} results loaded\r`);
    }
  }

  const finalCount = await page.locator('a.hfpxzc').count();
  log(`Total results loaded: ${finalCount}`);
}

// ============================================================
// GRID SEARCH (multi-point coverage)
// ============================================================

/**
 * Generate a circular grid of lat/lng points around a center
 */
function generateGrid(centerLat, centerLng, radiusKm, spacingKm) {
  const points = [{ lat: centerLat, lng: centerLng }];
  const latPerKm = 1 / 111.32;
  const lngPerKm = 1 / (111.32 * Math.cos(centerLat * Math.PI / 180));

  const steps = Math.ceil(radiusKm / spacingKm);

  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      if (i === 0 && j === 0) continue;
      const offsetLatKm = i * spacingKm;
      const offsetLngKm = j * spacingKm;
      const distKm = Math.sqrt(offsetLatKm ** 2 + offsetLngKm ** 2);

      if (distKm <= radiusKm) {
        points.push({
          lat: Math.round((centerLat + offsetLatKm * latPerKm) * 10000) / 10000,
          lng: Math.round((centerLng + offsetLngKm * lngPerKm) * 10000) / 10000,
        });
      }
    }
  }

  return points;
}

/**
 * Check if the browser session is signed into a Google account
 */
async function detectAuthentication(page) {
  return page.evaluate(() => {
    const sels = [
      'a[aria-label*="Google Account"]',
      'button[aria-label*="Google Account"]',
      'img.gb_A',
      '#gb a.gb_b',
    ];
    for (const sel of sels) {
      if (document.querySelector(sel)) return true;
    }
    return false;
  }).catch(() => false);
}

/**
 * Run grid search across multiple coordinate points, deduplicating results
 */
async function runGridSearch(page, category, centerLat, centerLng, zoom, radiusKm, spacingKm) {
  const isSignedIn = await detectAuthentication(page);
  const autoSpacing = isSignedIn ? 3 : 2;
  const spacing = spacingKm || autoSpacing;
  const radius = radiusKm || config.defaults.gridRadiusKm;

  const grid = generateGrid(centerLat, centerLng, radius, spacing);
  log(`Grid search: ${grid.length} points, ${radius}km radius, ${spacing}km spacing`);
  log(`Signed-in: ${isSignedIn} (${isSignedIn ? '~20-40' : '~8-15'} results/point expected)`);

  const estMin = Math.round(grid.length * (isSignedIn ? 0.5 : 1));
  const estMax = Math.round(grid.length * (isSignedIn ? 1 : 1.5));
  log(`Estimated runtime: ${estMin}-${estMax} min`);

  const allResults = [];
  const namesSeen = new Set();
  let captchaCount = 0;
  let skippedPoints = 0;

  for (let idx = 0; idx < grid.length; idx++) {
    const pt = grid[idx];
    log(`\n--- Point ${idx + 1}/${grid.length}: [${pt.lat}, ${pt.lng}] ---`);

    try {
      await navigateToNearbySearch(page, category, pt.lat, pt.lng, zoom);
      await scrollAndLoadResults(page);

      const results = await extractResultsFromList(page);
      let newCount = 0;
      for (const r of results) {
        const key = r.name.toLowerCase();
        if (!namesSeen.has(key)) {
          namesSeen.add(key);
          allResults.push(r);
          newCount++;
        }
      }

      log(`Found ${results.length}, ${newCount} new (total: ${allResults.length})`);

    } catch (err) {
      if (err.message.includes('CAPTCHA')) {
        captchaCount++;
        logWarn(`CAPTCHA at point ${idx + 1} - skipping`);
        if (captchaCount >= config.defaults.maxCaptchaBeforeAbort) {
          logWarn(`${captchaCount} CAPTCHAs hit - stopping grid search early`);
          break;
        }
        await sleep(randomDelay(60000, 90000));
        continue;
      }
      skippedPoints++;
      logWarn(`Error at point ${idx + 1}: ${err.message} - skipping`);
    }

    // Delay between points (shorter for signed-in sessions)
    if (idx < grid.length - 1) {
      const dMin = isSignedIn ? config.defaults.gridDelaySignedInMin : config.defaults.gridDelayAnonymousMin;
      const dMax = isSignedIn ? config.defaults.gridDelaySignedInMax : config.defaults.gridDelayAnonymousMax;
      const delay = randomDelay(dMin, dMax);
      log(`Waiting ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
    }
  }

  if (captchaCount > 0) logWarn(`${captchaCount} grid points skipped due to CAPTCHA`);
  if (skippedPoints > 0) logWarn(`${skippedPoints} grid points skipped due to errors`);
  log(`\nGrid search complete: ${allResults.length} unique businesses from ${grid.length - captchaCount - skippedPoints}/${grid.length} points`);

  return allResults;
}

/**
 * One-time setup: open browser for Google sign-in, save session to profile
 */
async function runSetup() {
  console.log('\n' + '='.repeat(60));
  console.log('  PROFILE SETUP - One-time Google Sign-in');
  console.log('='.repeat(60));

  const { context, page } = await launchBrowser(false);

  await page.goto('https://accounts.google.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  console.log('\n  Browser opened. Please:');
  console.log('  1. Sign into your Google account');
  console.log('  2. Once signed in, visit google.com/maps to confirm');
  console.log('  3. Close the browser window when done\n');

  // Wait for user to close the browser
  await new Promise((resolve) => context.on('close', () => resolve()));

  log('Profile saved to .playwright-profile/');
  log('Future runs will use this signed-in session.');
  log('Use --multi for grid search to get 100s of results.');
}

// ============================================================
// RESULT EXTRACTION
// ============================================================

/**
 * Extract business data from the search results list DOM
 */
async function extractResultsFromList(page) {
  log('Extracting business data from results...');

  const results = await page.evaluate(() => {
    const data = [];
    const links = document.querySelectorAll('a.hfpxzc');

    for (const link of links) {
      const name = (link.getAttribute('aria-label') || '').trim();
      if (!name) continue;

      const href = link.getAttribute('href') || '';

      // Walk up to find the result container
      let container = link.parentElement;
      for (let depth = 0; depth < 5; depth++) {
        if (!container || !container.parentElement) break;
        if (container.classList.contains('Nv2PK') || container.querySelector('.W4Efsd')) break;
        container = container.parentElement;
      }

      // Collect all text lines from the container
      const allText = container ? container.innerText : '';
      const lines = allText.split('\n').map(l => l.trim()).filter(l => l && l !== name);

      let rating = 0;
      let reviewCount = 0;
      let category = '';
      let address = '';
      let phone = '';
      let isSponsored = false;

      // Check for sponsored
      const lowerText = allText.toLowerCase();
      if (lowerText.includes('sponsored') || /^ad[\s\n]/.test(lowerText)) {
        isSponsored = true;
      }

      for (const line of lines) {
        // Rating: "4.5" standalone or leading a line like "4.5(123)"
        const ratingMatch = line.match(/^(\d\.\d)\s*$/);
        if (ratingMatch && !rating) {
          rating = parseFloat(ratingMatch[1]);
          continue;
        }

        // Combined rating + reviews: "4.5(123)"
        const comboMatch = line.match(/^(\d\.\d)\s*\((\d[\d,]*)\)$/);
        if (comboMatch && !rating) {
          rating = parseFloat(comboMatch[1]);
          reviewCount = parseInt(comboMatch[2].replace(/,/g, ''), 10);
          continue;
        }

        // Review count: "(123)"
        const reviewMatch = line.match(/^\((\d[\d,]*)\)$/);
        if (reviewMatch && !reviewCount) {
          reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);
          continue;
        }

        // Phone pattern (UK/intl): starts with 0, +, or has enough digits)
        if (!phone && /^[\d\s\+\(\)\-]{7,20}$/.test(line) && /\d{3}/.test(line)) {
          phone = line;
          continue;
        }

        // Skip time/status lines and UI button text
        if (/^(Open|Closed|Opens|Closes|24 hours)/i.test(line)) continue;
        if (/^\d+:\d{2}/.test(line)) continue;
        if (/^(Website|Directions|Order|Menu|Reserve|Call|Share|Save|Suggest an edit|Send to your phone)$/i.test(line)) continue;

        // Category: short text, no digits, not a known skip
        if (!category && line.length > 2 && line.length < 60 && !/\d/.test(line)) {
          category = line;
          continue;
        }

        // Address: contains digits (street numbers), longer text
        if (!address && /\d/.test(line) && line.length > 5 && !/^\d\.\d$/.test(line)) {
          address = line;
          continue;
        }
      }

      // Post-process: if category is empty but address contains " · ", the category is before the dot
      if (!category && address && address.includes(' · ')) {
        const parts = address.split(' · ').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2 && !/\d/.test(parts[0])) {
          category = parts[0];
          address = parts.slice(1).join(' · ');
        }
      }

      data.push({ name, href, rating, reviewCount, category, address, phone, isSponsored });
    }

    return data;
  });

  const organic = results.filter(r => !r.isSponsored);
  const sponsored = results.filter(r => r.isSponsored);

  if (sponsored.length > 0) {
    log(`  Sponsored results (excluded): ${sponsored.length}`);
  }
  log(`  Organic results extracted: ${organic.length}`);

  return organic;
}

// ============================================================
// PHONE EXTRACTION FROM PLACE PAGES
// ============================================================

/**
 * Visit each business's place page to extract phone numbers
 */
async function extractPhonesFromPlacePages(page, results) {
  const needPhone = results.filter(r => !r.phone && r.href);
  if (needPhone.length === 0) {
    log('All phones already extracted from list view');
    return;
  }

  log(`Extracting phones for ${needPhone.length}/${results.length} businesses...`);

  for (let i = 0; i < needPhone.length; i++) {
    const r = needPhone[i];
    const shortName = r.name.length > 45 ? r.name.substring(0, 42) + '...' : r.name;
    process.stdout.write(`  [${i + 1}/${needPhone.length}] ${shortName}\r`);

    try {
      const fullUrl = r.href.startsWith('http')
        ? r.href
        : `https://www.google.com${r.href}`;

      await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(randomDelay(1500, 2500));

      const phone = await page.evaluate((selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (!el) continue;

          // Try aria-label first (most reliable)
          const label = el.getAttribute('aria-label') || '';
          const m1 = label.match(/[\d\s\+\(\)\-]{7,}/);
          if (m1) return m1[0].trim();

          // Try text content
          const text = el.textContent || '';
          const m2 = text.match(/[\d\s\+\(\)\-]{7,}/);
          if (m2) return m2[0].trim();

          // Try href for tel: links
          const href = el.getAttribute('href') || '';
          if (href.startsWith('tel:')) {
            return href.replace('tel:', '').trim();
          }
        }
        return '';
      }, config.selectors.placePhone);

      if (phone) r.phone = phone;

      // Anti-detection: occasional mouse move
      if (i % 5 === 0) await randomMouseMove(page);

    } catch {
      // Skip failures silently - phone is supplementary data
    }
  }

  console.log(''); // Clear \r line
  const foundCount = needPhone.filter(r => r.phone).length;
  log(`  Phones found: ${foundCount}/${needPhone.length}`);
}

// ============================================================
// NAME CLEANING & NEGATOR LOGIC
// ============================================================

function loadDictionary(repoRoot) {
  const dictPath = path.join(repoRoot, 'resources', 'words.txt');
  if (!fs.existsSync(dictPath)) {
    logError(`Dictionary not found: ${dictPath}`);
    logError('Expected at: <repo-root>/resources/words.txt');
    process.exit(1);
  }

  log('Loading dictionary...');
  const content = fs.readFileSync(dictPath, 'utf-8');
  const words = new Set();
  for (const line of content.split('\n')) {
    const w = line.trim().toLowerCase();
    if (w) words.add(w);
  }
  log(`  ${words.size.toLocaleString()} words loaded`);
  return words;
}

function loadLocations(repoRoot) {
  // Try multiple locations for the locations file
  const paths = [
    path.join(repoRoot, '.claude', 'skills', 'ch-minimum-negator', 'data', 'locations.txt'),
    path.join(repoRoot, 'resources', 'locations.txt'),
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      const locs = content.split('\n').map(l => l.trim()).filter(Boolean);
      locs.sort((a, b) => b.length - a.length); // longest first
      log(`  ${locs.length.toLocaleString()} locations loaded from ${path.basename(path.dirname(p))}/${path.basename(p)}`);
      return locs;
    }
  }

  log('  No locations file found (location stripping disabled)');
  return [];
}

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function cleanBusinessName(rawName, locations) {
  if (!rawName || !rawName.trim()) return null;

  let cleaned = rawName.trim();

  // Strip corporate identifiers
  cleaned = cleaned.replace(config.corporateIdentifiersRegex, '');

  // Remove parentheticals
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');
  cleaned = cleaned.replace(/\s*\([^)]*$/, '');

  // Strip trailing locations (longest match first)
  if (locations && locations.length > 0) {
    let prev;
    do {
      prev = cleaned;
      for (const loc of locations) {
        const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\s+)${escaped}$`, 'i');
        if (regex.test(cleaned)) {
          cleaned = cleaned.replace(regex, '').trim();
          break;
        }
      }
    } while (cleaned !== prev);
  }

  // Final cleanup
  cleaned = cleaned.replace(/,\s*$/, '');
  cleaned = cleaned.replace(/\s*[.\-]\s*$/, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned || null;
}

function findMinimumNegator(companyName, dictionary) {
  const words = companyName.toLowerCase().split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z0-9]/g, '');
    if (word && !dictionary.has(word)) {
      return words.slice(0, i + 1).join(' ');
    }
  }

  // All words are dictionary words - return the full name
  return companyName.toLowerCase();
}

function hasSpecialChar(str) {
  return /[&\-\.\/\\@#\+]/.test(str);
}

// ── Google Ads API: Live Keyword Fetch ─────────────────────────────────

async function fetchLiveKeywords(clientSlug, root) {
  const registryPath = path.join(root, 'google-ads-api', 'clients-registry.json');
  if (!fs.existsSync(registryPath)) {
    console.log('  clients-registry.json not found - skipping API keyword fetch');
    return [];
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  const client = registry[clientSlug];
  if (!client) {
    console.log(`  Client "${clientSlug}" not found in registry - skipping API keyword fetch`);
    return [];
  }

  console.log(`Fetching live keywords for ${clientSlug} (${client.accountId})...`);

  const authPath = pathToFileURL(path.join(root, 'google-ads-api', 'lib', 'auth.js')).href;
  const { getConfiguredCustomer } = await import(authPath);
  const { customer } = getConfiguredCustomer(client.accountId, client.loginCustomerId);

  const query = `
    SELECT ad_group_criterion.keyword.text
    FROM keyword_view
    WHERE ad_group_criterion.negative = FALSE
      AND campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_criterion.status = 'ENABLED'
  `;

  const rows = await customer.query(query);
  const keywords = [...new Set(
    rows.map(r => r.ad_group_criterion.keyword.text.toLowerCase())
  )];

  console.log(`  Found ${keywords.length} live keywords: ${keywords.join(', ')}`);
  return keywords;
}

function checkKeywordConflicts(negator, keywords) {
  return keywords.filter(kw => kw.includes(negator));
}

/**
 * Refines a negator that is too short or conflicts with keywords
 */
function refineNegator(initialNegator, cleanedName, rawName, keywords) {
  const needsWork = (neg) => {
    const tooShort = neg.length < 5 && !hasSpecialChar(neg);
    const conflicts = checkKeywordConflicts(neg, keywords);
    return tooShort || conflicts.length > 0;
  };

  if (!needsWork(initialNegator)) return initialNegator;

  const cleanedWords = cleanedName.toLowerCase().split(/\s+/);
  const negWords = initialNegator.split(/\s+/);
  let startIdx = negWords.length;

  // Phase 1: extend from remaining cleaned name words
  let current = initialNegator;
  for (let i = startIdx; i < cleanedWords.length; i++) {
    current += ' ' + cleanedWords[i];
    if (!needsWork(current)) return current;
  }

  // Phase 2: extend from raw name words stripped during cleaning
  const rawWords = rawName.toLowerCase().split(/\s+/)
    .map(w => w.replace(/[()]/g, '').trim())
    .filter(w => w.length > 0);
  const cleanedSet = new Set(cleanedWords);
  for (const w of rawWords) {
    if (!cleanedSet.has(w)) {
      current += ' ' + w;
      if (!needsWork(current)) return current;
    }
  }

  return current;
}

// ============================================================
// OUTPUT GENERATION
// ============================================================

function writeCompetitorJSON(competitors, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(competitors, null, 2), 'utf-8');
}

function writeCompetitorCSV(competitors, filePath) {
  const esc = s => `"${(s || '').replace(/"/g, '""')}"`;
  const header = 'Name,Category,Rating,Reviews,Address,Phone,Maps URL';
  const rows = competitors.map(c => [
    esc(c.name),
    esc(c.category),
    c.rating || '',
    c.reviewCount || '',
    esc(c.address),
    esc(c.phone),
    esc(c.href ? (c.href.startsWith('http') ? c.href : `https://www.google.com${c.href}`) : ''),
  ].join(','));
  fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf-8');
}

function writeNegativesCSV(results, filePath) {
  const esc = s => `"${(s || '').replace(/"/g, '""')}"`;
  const header = 'Raw Name,Cleaned Name,Minimum Negator,Blocked Keywords,Source';
  const rows = results.map(r => [
    esc(r.rawName),
    esc(r.cleanedName),
    esc(r.negator),
    esc(r.blockedKeywords.join('; ')),
    esc('Google Maps'),
  ].join(','));
  fs.writeFileSync(filePath, [header, ...rows].join('\n'), 'utf-8');
}

function writeSafeNegatives(results, filePath) {
  const safe = results.filter(r => r.safe).map(r => r.negator);
  const unique = [...new Set(safe)];
  fs.writeFileSync(filePath, unique.join('\n'), 'utf-8');
  return unique.length;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const opts = parseArgs();
  const date = timestamp();

  console.log('\n' + '='.repeat(60));
  console.log('  GMAPS MINIMUM NEGATOR');
  console.log('  Google Maps Competitor Scraper + Negative Keyword Generator');
  console.log('='.repeat(60));

  // Setup mode
  if (opts.setup) {
    await runSetup();
    return;
  }

  // Dry run
  if (opts.dryRun) {
    console.log('\n--- DRY RUN ---');
    console.log(`Client:     ${opts.clientName}`);
    console.log(`Business:   ${opts.business || '(using coordinates)'}`);
    console.log(`Category:   ${opts.category}`);
    console.log(`Location:   ${opts.location || '(none)'}`);
    console.log(`Keywords:   ${opts.keywords.length ? opts.keywords.join(', ') : '(none)'}`);
    console.log(`Zoom:       ${opts.zoom}`);
    console.log(`Lat/Lng:    ${opts.lat != null ? `${opts.lat}, ${opts.lng}` : '(from seed search)'}`);
    console.log(`Multi:      ${opts.multi ? `YES (radius: ${opts.radius}km, spacing: ${opts.gridSpacing || 'auto'})` : 'no (single point)'}`);
    console.log(`Phone:      ${opts.noPhone ? 'SKIP' : 'extract from place pages'}`);
    console.log(`Headless:   ${opts.headless}`);
    console.log(`Debug:      ${opts.debug}`);
    console.log(`Output:     clients/${opts.clientName}/gmaps-minimum-negator/`);
    return;
  }

  // Auto-fetch live keywords from Google Ads API if client provided and no manual keywords
  if (opts.clientName && opts.keywords.length === 0) {
    try {
      opts.keywords = await fetchLiveKeywords(opts.clientName, opts.root);
    } catch (e) {
      console.log(`  Could not fetch live keywords: ${e.message}`);
      console.log('  Continuing without keyword conflict checking.');
    }
  }

  // Load dictionary and locations (before browser launch)
  const dictionary = loadDictionary(opts.root);
  const locations = loadLocations(opts.root);

  // Set up output directory
  const outDir = path.join(opts.root, 'clients', opts.clientName, 'gmaps-minimum-negator');
  fs.mkdirSync(outDir, { recursive: true });

  let context, page;

  try {
    // ── Phase 1: Browser + Search ──
    ({ context, page } = await launchBrowser(opts.headless));

    let lat = opts.lat;
    let lng = opts.lng;

    // Find seed business coordinates (unless provided directly)
    if (lat == null || lng == null) {
      await searchSeedBusiness(page, opts.business, opts.location);

      // Wait for URL to stabilize with coordinates
      await sleep(2000);
      const coords = extractCoordsFromUrl(page.url());

      if (!coords) {
        if (opts.debug) {
          const html = await page.content();
          fs.writeFileSync(path.join(outDir, `debug_no_coords_${date}.html`), html);
          await page.screenshot({ path: path.join(outDir, `debug_no_coords_${date}.png`), fullPage: true });
        }
        throw new Error('Could not extract coordinates from seed business page. Use --lat/--lng as fallback.');
      }

      lat = coords.lat;
      lng = coords.lng;
      log(`Seed coordinates: [${lat}, ${lng}]`);
    } else {
      // Still need to navigate to Maps for consent handling
      await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await handleConsent(page);
      log(`Using provided coordinates: [${lat}, ${lng}]`);
    }

    // ── Phase 2: Search ──
    let competitors;

    if (opts.multi) {
      competitors = await runGridSearch(page, opts.category, lat, lng, opts.zoom, opts.radius, opts.gridSpacing);
    } else {
      await navigateToNearbySearch(page, opts.category, lat, lng, opts.zoom);
      await scrollAndLoadResults(page);
      competitors = await extractResultsFromList(page);
    }

    if (opts.debug) {
      await page.screenshot({ path: path.join(outDir, `debug_results_${date}.png`), fullPage: true });
    }

    // Exclude seed business
    if (opts.business) {
      const seedLower = opts.business.toLowerCase();
      const before = competitors.length;
      competitors = competitors.filter(c => !c.name.toLowerCase().includes(seedLower));
      const excluded = before - competitors.length;
      if (excluded > 0) log(`Excluded seed business "${opts.business}" (${excluded} removed)`);
    }

    if (competitors.length === 0) {
      logWarn('No competitors found after filtering.');
      await context.close();
      return;
    }

    // Deduplicate by name
    const nameMap = new Map();
    for (const c of competitors) {
      const key = c.name.toLowerCase();
      if (!nameMap.has(key)) nameMap.set(key, c);
    }
    const uniqueCompetitors = Array.from(nameMap.values());
    if (uniqueCompetitors.length < competitors.length) {
      log(`Deduplicated: ${competitors.length} -> ${uniqueCompetitors.length}`);
    }
    competitors = uniqueCompetitors;

    // ── Phase 4: Phone Extraction ──
    if (!opts.noPhone && competitors.length > 50) {
      log(`${competitors.length} businesses - phone extraction will take ~${Math.round(competitors.length * 3 / 60)} min. Use --no-phone to skip.`);
    }
    if (!opts.noPhone) {
      await extractPhonesFromPlacePages(page, competitors);
    }

    // Close browser
    await context.close();
    log('Browser closed');

    // ── Phase 5: Name Cleaning + Negators ──
    log('Generating negative keywords...');

    const negatorResults = [];
    for (const comp of competitors) {
      const cleaned = cleanBusinessName(comp.name, locations);
      if (!cleaned) continue;

      const initialNegator = findMinimumNegator(cleaned, dictionary);
      const negator = refineNegator(initialNegator, cleaned, comp.name, opts.keywords);
      const blocked = checkKeywordConflicts(negator, opts.keywords);

      negatorResults.push({
        rawName: comp.name,
        cleanedName: cleaned.toLowerCase(),
        negator,
        safe: blocked.length === 0,
        blockedKeywords: blocked,
      });
    }

    // Deduplicate by negator
    const negMap = new Map();
    for (const r of negatorResults) {
      if (!negMap.has(r.negator)) negMap.set(r.negator, r);
    }
    const dedupedNegators = Array.from(negMap.values());

    const safeCount = dedupedNegators.filter(r => r.safe).length;
    const conflictCount = dedupedNegators.filter(r => !r.safe).length;

    // ── Phase 6: Output ──
    const jsonPath = path.join(outDir, `gmaps-competitors_${date}.json`);
    writeCompetitorJSON(competitors, jsonPath);
    log(`Competitors JSON: ${jsonPath}`);

    const compCsvPath = path.join(outDir, `gmaps-competitors_${date}.csv`);
    writeCompetitorCSV(competitors, compCsvPath);
    log(`Competitors CSV: ${compCsvPath}`);

    const negCsvPath = path.join(outDir, `gmaps-negatives_${date}.csv`);
    writeNegativesCSV(dedupedNegators, negCsvPath);
    log(`Negatives CSV: ${negCsvPath}`);

    const safePath = path.join(outDir, `safe-negatives_${date}.txt`);
    const safeWritten = writeSafeNegatives(dedupedNegators, safePath);
    log(`Safe negatives (${safeWritten}): ${safePath}`);

    // ── Summary ──
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  RESULTS`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Competitors scraped:  ${competitors.length}`);
    console.log(`  Phones extracted:     ${competitors.filter(c => c.phone).length}/${competitors.length}`);
    console.log(`  Unique negators:      ${dedupedNegators.length}`);
    console.log(`  Safe (no conflicts):  ${safeCount}`);
    console.log(`  Conflicts:            ${conflictCount}`);
    console.log(`${'='.repeat(60)}`);

    // Show conflicts
    if (conflictCount > 0) {
      console.log('\nCONFLICTS (do NOT add these as negatives):');
      dedupedNegators.filter(r => !r.safe).forEach(r => {
        console.log(`  "${r.negator}" blocks keywords: ${r.blockedKeywords.join(', ')}`);
      });
    }

    // Show safe negatives
    console.log('\nSAFE NEGATIVE KEYWORDS (phrase match):');
    console.log('-'.repeat(40));
    const safeNegators = [...new Set(dedupedNegators.filter(r => r.safe).map(r => r.negator))];
    for (const neg of safeNegators) {
      console.log(`  "${neg}"`);
    }
    console.log('-'.repeat(40));
    console.log(`Total: ${safeNegators.length} safe negatives`);

    if (opts.keywords.length === 0) {
      console.log('\nNote: No keywords available - all negators shown as "safe".');
      console.log('Live keyword fetch from Google Ads API failed or returned empty.');
      console.log('Re-run with --keywords "kw1, kw2, ..." to check for conflicts manually.');
    }

    console.log(`\nOutput: clients/${opts.clientName}/gmaps-minimum-negator/`);

  } catch (err) {
    logError(err.message);
    if (context) {
      try { await context.close(); } catch {}
    }
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});

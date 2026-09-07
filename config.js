// ============================================================
// GMAPS MINIMUM NEGATOR - Configuration
// Update selectors here when Google Maps changes layout
// ============================================================

module.exports = {
  businessName: 'Agentic PPC Ads',

  defaults: {
    zoom: 14,
    debug: false,
    maxScrollAttempts: 60,
    scrollPauseMin: 1200,
    scrollPauseMax: 2500,
    // Multi-point grid search
    gridRadiusKm: 5,
    gridDelaySignedInMin: 10000,
    gridDelaySignedInMax: 20000,
    gridDelayAnonymousMin: 20000,
    gridDelayAnonymousMax: 40000,
    maxCaptchaBeforeAbort: 3,
  },

  // -----------------------------------------------------------
  // SELECTORS - Update these when Google Maps changes layout
  // -----------------------------------------------------------
  selectors: {
    // Search box
    searchBox: [
      'input[name="q"]',
      'input[role="combobox"]',
      'input#searchboxinput',
      'input.UGojuc',
    ],

    // Consent dialog (cookie banner)
    consentAccept: [
      'button[aria-label*="Accept all"]',
      'button[aria-label*="Accept"]',
      'form[action*="consent"] button:first-of-type',
      '[aria-label="Accept all"]',
    ],

    // Business title on place page
    businessTitle: [
      'h1.DUwDvf',
      'h1',
      '[data-attrid="title"]',
    ],

    // Result links in search results feed
    resultLink: [
      'a.hfpxzc',
    ],

    // Scrollable results panel (for infinite scroll)
    scrollablePanel: [
      'div.m6QErb.DxyBCb',
      'div.m6QErb',
      '[role="feed"]',
    ],

    // Place page - phone
    placePhone: [
      'button[data-item-id*="phone"]',
      'a[data-item-id*="phone"]',
      '.rogA2c a[href^="tel:"]',
    ],

    // Place page - address
    placeAddress: [
      'button[data-item-id="address"]',
      '.rogA2c .Io6YTe',
    ],

    // Place page - category
    placeCategory: [
      'button[jsaction*="category"]',
      '.DkEaL',
    ],

    // Place page - website
    placeWebsite: [
      'a[data-item-id="authority"]',
      'a[data-item-id*="website"]',
    ],
  },

  // Human-like typing delays (ms)
  delays: {
    typingMin: 50,
    typingMax: 150,
    afterSearchMin: 3000,
    afterSearchMax: 5000,
    beforeClickMin: 500,
    beforeClickMax: 1500,
    mouseMovePauseMin: 100,
    mouseMovePauseMax: 400,
  },

  // User agent rotation pool (real Chrome UAs)
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ],

  // Corporate identifiers regex (for name cleaning)
  corporateIdentifiersRegex: /\b(LLC|L\.L\.C\.?|Inc\.?|Corporation|Corp\.?|Company|Co\.?|Ltd\.?|Limited|PLC|CIC|C\.I\.C\.?|LLP)\b/gi,
};

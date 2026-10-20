import { chromium } from 'playwright';

async function testPWA() {
  console.log('--- STARTING PWA COMPLIANCE AND FUNCTIONALITY TESTS ---');
  let failures = 0;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  try {
    console.log('\n[TEST 1] Loading app root http://127.0.0.1:19899/ ...');
    const response = await page.goto('http://127.0.0.1:19899/', { waitUntil: 'networkidle' });
    if (response.status() === 200) {
      console.log('✓ Page loaded successfully (HTTP 200)');
    } else {
      console.error(`✗ Page load failed with status: ${response.status()}`);
      failures++;
    }

    console.log('\n[TEST 2] Verifying PWA Meta and Link tags in HTML head ...');
    const manifestLink = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href')).catch(() => null);
    console.log(`- Manifest link: ${manifestLink}`);
    if (manifestLink === '/manifest.webmanifest') {
      console.log('✓ <link rel="manifest"> found and correct');
    } else {
      console.error('✗ <link rel="manifest"> missing or incorrect');
      failures++;
    }

    const themeColor = await page.$eval('meta[name="theme-color"]', el => el.getAttribute('content')).catch(() => null);
    console.log(`- Theme color: ${themeColor}`);
    if (themeColor === '#37003c') {
      console.log('✓ Theme color meta tag correct');
    } else {
      console.error('✗ Theme color meta tag incorrect or missing');
      failures++;
    }

    const appleCapable = await page.$eval('meta[name="apple-mobile-web-app-capable"]', el => el.getAttribute('content')).catch(() => null);
    if (appleCapable === 'yes') {
      console.log('✓ iOS apple-mobile-web-app-capable is "yes"');
    } else {
      console.error('✗ apple-mobile-web-app-capable missing');
      failures++;
    }

    const appleTouchIcon = await page.$eval('link[rel="apple-touch-icon"]', el => el.getAttribute('href')).catch(() => null);
    if (appleTouchIcon) {
      console.log(`✓ apple-touch-icon found: ${appleTouchIcon}`);
    } else {
      console.error('✗ apple-touch-icon missing');
      failures++;
    }

    console.log('\n[TEST 3] Validating Web App Manifest content ...');
    const manifestResp = await page.evaluate(async () => {
      const res = await fetch('/manifest.webmanifest');
      return { status: res.status, data: await res.json() };
    });

    if (manifestResp.status === 200) {
      console.log('✓ manifest.webmanifest fetched successfully (HTTP 200)');
      const m = manifestResp.data;
      console.log(`- Name: "${m.name}", Short: "${m.short_name}"`);
      console.log(`- Display: "${m.display}", Start URL: "${m.start_url}"`);
      console.log(`- Icons count: ${m.icons?.length}`);

      const has192 = m.icons.some(i => i.sizes === '192x192' && (i.purpose === 'any' || !i.purpose));
      const has512 = m.icons.some(i => i.sizes === '512x512' && (i.purpose === 'any' || !i.purpose));
      const hasMaskable = m.icons.some(i => i.purpose === 'maskable');

      if (has192 && has512 && hasMaskable && m.display === 'standalone' && m.name && m.start_url) {
        console.log('✓ Manifest meets all Chromium/W3C PWA Installability requirements!');
      } else {
        console.error('✗ Manifest missing requirements:', { has192, has512, hasMaskable, display: m.display });
        failures++;
      }
    } else {
      console.error(`✗ Failed to fetch manifest: status ${manifestResp.status}`);
      failures++;
    }

    console.log('\n[TEST 4] Verifying Service Worker Registration ...');
    const swStatus = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      
      const reg = await navigator.serviceWorker.ready;
      return {
        supported: true,
        active: !!reg.active,
        scope: reg.scope,
        state: reg.active ? reg.active.state : null,
      };
    });

    console.log('- Service worker status:', swStatus);
    if (swStatus.supported && swStatus.active) {
      console.log('✓ Service Worker successfully registered and active!');
    } else {
      console.error('✗ Service Worker registration failed or not active');
      failures++;
    }

    // Refresh once online to guarantee service worker intercepts and caches scripts/styles
    await page.reload({ waitUntil: 'networkidle' });

    console.log('\n[TEST 5] Testing Offline Functionality via Service Worker Cache ...');
    // Set browser offline
    await context.setOffline(true);
    console.log('- Emulated browser offline mode (context.setOffline(true))');

    // Reload the page while completely offline
    await page.reload({ waitUntil: 'networkidle' });

    // Check if the page rendered and heading exists
    const appHeaderTitle = await page.$eval('.brand-text h1', el => el.textContent.trim()).catch(() => null);
    console.log(`- App title after offline reload: "${appHeaderTitle}"`);

    if (appHeaderTitle && appHeaderTitle.includes('EPL PREDICTOR')) {
      console.log('✓ App shell successfully loaded from cache while completely OFFLINE!');
    } else {
      console.error('✗ App failed to load offline');
      failures++;
    }

    // Check offline banner via offline event
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    const isOfflineBannerVisible = await page.$eval('#pwaOfflineBanner', el => {
      return window.getComputedStyle(el).display !== 'none';
    }).catch(() => false);

    console.log(`- Offline banner visible: ${isOfflineBannerVisible}`);
    if (isOfflineBannerVisible) {
      console.log('✓ Offline status banner correctly triggered in offline mode!');
    } else {
      console.error('✗ Offline banner failed to display on offline event');
      failures++;
    }

    // Test online restoration
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    const isOfflineBannerHidden = await page.$eval('#pwaOfflineBanner', el => {
      return window.getComputedStyle(el).display === 'none';
    }).catch(() => false);

    if (isOfflineBannerHidden) {
      console.log('✓ Offline banner automatically hides when online connection restored!');
    }

    // Restore online
    await context.setOffline(false);
    console.log('- Restored online mode');

  } catch (error) {
    console.error('Unexpected test exception:', error);
    failures++;
  } finally {
    await browser.close();
  }

  console.log('\n--- PWA TEST SUMMARY ---');
  if (failures === 0) {
    console.log('🎉 ALL PWA COMPLIANCE AND INSTALLABILITY TESTS PASSED!');
    process.exit(0);
  } else {
    console.error(`❌ ${failures} test(s) failed.`);
    process.exit(1);
  }
}

testPWA();

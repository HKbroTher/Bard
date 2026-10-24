// Renders build/icon.svg to build/icon.png (1024×1024); electron-builder derives .icns/.ico from it.
// Needs Playwright with Chromium installed: `npx playwright install chromium`.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const build = join(__dirname, "..", "build");
  const svg = readFileSync(join(build, "icon.svg"), "utf8").replace("<svg ", '<svg width="1024" height="1024" ');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: join(build, "icon.png"), omitBackground: true });
  await browser.close();
})();

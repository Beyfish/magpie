// Run with Node's test runner and Playwright on the module path; see README.md.
// A plugin page the reader hides (Settings › Plugins, pluginpages.js) gets
// no entry in the sidebar's Plugins group, while its row in that settings
// list stays, its plugin stays on and stays in Extensions › Plugins ›
// Installed. Showing it again brings the entry back. Every language, both
// engines, a wide window and a narrow one; no backend, the API is faked.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");
const reader = require("./reader.cjs");

const assets = path.resolve(__dirname, "../assets");
const server = (lang, saved, posts) => async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (data) => route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
  if (url.pathname === "/boot.js") return route.fulfill({ contentType: "text/javascript", body: `window.bootPrefs = {lang:"${lang}",theme:"light",web:false};` });
  if (url.pathname === "/wails/runtime.js") return route.fulfill({ contentType: "text/javascript", body: "export const Window = {};" });
  if (url.pathname === "/api/state") return json({ agents: [], clients: [], profiles: [], settings: { lang, theme: "light", pluginPagesHidden: saved.hidden } });
  if (url.pathname === "/api/plugin-pages") return json(PAGES);
  if (url.pathname === "/api/plugin-pages/hidden") {
    const b = req.postDataJSON();
    posts.push(b.hidden);
    saved.hidden = b.hidden;
    return json({ pluginPagesHidden: saved.hidden });
  }
  if (url.pathname === "/api/plugins") return json({ bun: true, bunVersion: "1.3.0", plugins: [] });
  if (url.pathname === "/api/window/titlebar") return route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" });
  if (url.pathname.startsWith("/api/")) return json({});
  if (url.host !== "magpie.test") return route.fulfill({ status: 404, body: "" });
  const file = path.join(assets, url.pathname === "/" ? "index.html" : url.pathname);
  const contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }[path.extname(file)];
  try { await route.fulfill({ body: await fs.readFile(file), contentType }); } catch { await route.fulfill({ status: 404, body: "" }); }
};

const GLANCE = "a".repeat(32), QUIET = "b".repeat(32);
const entry = (tok, name, title, titles) => ({
  spec: "/x/" + name, name, key: "plugin-" + name, title, reads: [],
  url: `/_magpie/plugin/${tok}/index.html`, titles, icon: "",
});
const TITLES = { zh: "用量速览", "zh-TW": "用量速覽", ja: "使用量の概要" };
const PAGES = [
  { ...entry(GLANCE, "glance", "Usage glance"), titles: TITLES },
  entry(QUIET, "quiet", "Quiet page"),
];
const T = {
  en: { show: "Show", hide: "Hide" },
  zh: { show: "显示", hide: "隐藏" },
  "zh-TW": { show: "顯示", hide: "隱藏" },
  ja: { show: "表示", hide: "非表示" },
  de: { show: "Anzeigen", hide: "Ausblenden" },
};

for (const engine of (process.env.BROWSER ? [process.env.BROWSER] : ["chromium", "webkit"])) {
  test(`${engine}: a hidden plugin page gets no sidebar entry`, async (t) => {
    const browser = await (engine === "webkit" ? webkit.launch() : chromium.launch({ channel: "chromium" }));
    t.after(() => browser.close());
    for (const lang of ["en", "zh", "zh-TW", "ja", "de"]) {
      for (const width of [1100, 420]) {
        const where = `${engine} ${lang} ${width}`;
        const context = await browser.newContext({ viewport: { width, height: 700 }, reducedMotion: "reduce" });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        page.setDefaultNavigationTimeout(60000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const saved = { hidden: [] }, posts = [];
        await page.route("**/*", server(lang, saved, posts));
        await page.goto("http://magpie.test/");

        // both pages in the sidebar by default
        const tabs = page.locator("#nav button[data-plugin-page]");
        await page.waitForFunction(() => document.querySelectorAll("#nav button[data-plugin-page]").length === 2);
        const keys = await tabs.evaluateAll((bs) => bs.map((b) => b.dataset.view));
        assert.deepEqual(keys, ["plugin-glance", "plugin-quiet"], `${where}: both shown`);

        // Settings › Plugins lists both, each shown
        await page.goto("http://magpie.test/?view=settings");
        await reader.openPart(page, "plugins");
        const rows = page.locator(".plugin-pages-row");
        await page.waitForFunction(() => document.querySelectorAll(".plugin-pages-row").length === 2
          && document.querySelector(".plugin-pages-row").getBoundingClientRect().height > 0);
        assert.deepEqual(await rows.evaluateAll((rs) => rs.map((r) => r.textContent.includes("Usage glance") || r.textContent.includes("用量") || r.textContent.includes("使用量"))),
          [true, false], `${where}: settings rows titled in the window's language`);

        // hide the glance page: its entry goes from the sidebar, its row stays
        const glanceTitle = TITLES[lang] || "Usage glance";
        await rows.filter({ hasText: glanceTitle }).getByRole("button", { name: T[lang].hide, exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll("#nav button[data-plugin-page]").length === 1);
        assert.deepEqual(posts, [["plugin-glance"]], `${where}: saved`);
        assert.equal(await rows.count(), 2, `${where}: both rows stay`);
        assert.deepEqual(await tabs.evaluateAll((bs) => bs.map((b) => b.dataset.view)), ["plugin-quiet"], `${where}: glance gone`);

        // show it again: the entry comes back
        await rows.filter({ hasText: glanceTitle }).getByRole("button", { name: T[lang].show, exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll("#nav button[data-plugin-page]").length === 2);
        assert.deepEqual(posts, [["plugin-glance"], []], `${where}: saved again`);
        assert.deepEqual(errors, [], `${where}: no page errors: ${errors.join("; ")}`);
        await context.close();
      }
    }
  });
}

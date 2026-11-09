// Settings › Plugins: which of the plugins' pages the sidebar shows.
// pluginpages.js imports this when a plugin page's settings are drawn
// (drawPagesSettings), so it weighs nothing on the core.

// a page's title in the window's language, as pluginpages.js titles it
function pagesTitled(e) {
  const m = e.titles || {};
  return m[locale] || m[locale.split("-")[0]] || e.title;
}

window.pluginPagesSettingsDraw = function (list, hidden) {
  const box = $("#pluginPagesSettings");
  if (!box) return;
  const head = el("div", "row pref");
  const headWho = el("div", "who");
  headWho.append(el("div", "name", t("Plugin pages")));
  head.append(headWho);
  const rows = [head, ...list.map((e) => {
    const row = el("div", "row pref plugin-pages-row");
    const who = el("div", "who");
    who.append(el("div", "name", pagesTitled(e)));
    row.append(who);
    row.append(segs([[true, t("Show")], [false, t("Hide")]], !hidden.has(e.key), async (on) => {
      const prev = state.settings, next = new Set(hidden);
      if (on) next.delete(e.key); else next.add(e.key);
      state.settings = { ...prev, pluginPagesHidden: [...next] };
      try {
        const s = await api("plugin-pages/hidden", { hidden: [...next] });
        state.settings = { ...state.settings, pluginPagesHidden: s.pluginPagesHidden || [] };
      } catch (err) { state.settings = prev; settingsErr(err); return; }
      window.loadPluginPages();
    }));
    return row;
  })];
  box.replaceChildren(...rows);
  box.hidden = !list.length;
  if (typeof setSetTab === "function") setSetTab(setTab);
};

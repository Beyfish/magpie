package gui

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/yetone/magpie/internal/settings"
)

// The sidebar's Plugins group leaves out the plugin pages hidden here
// (Settings › Plugins), kept in magpie's settings: each is saved on its
// own, the other settings left as they are, and it outlasts a save of the
// Settings page.
func TestPluginPagesHidden(t *testing.T) {
	h := t.TempDir()
	t.Setenv("HOME", h)
	t.Setenv("USERPROFILE", h)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(h, ".config"))
	t.Setenv("XDG_CACHE_HOME", filepath.Join(h, ".cache"))
	t.Setenv("APPDATA", filepath.Join(h, "AppData", "Roaming"))
	t.Setenv("LOCALAPPDATA", filepath.Join(h, "AppData", "Local"))
	post := func(path, body string) {
		t.Helper()
		rec := httptest.NewRecorder()
		Handler(nil, nil).ServeHTTP(rec, httptest.NewRequest("POST", path, strings.NewReader(body)))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
	want := func(hidden []string) {
		t.Helper()
		s := settings.Load()
		if !slices.Equal(s.PluginPagesHidden, hidden) {
			t.Fatalf("hidden %v, want %v", s.PluginPagesHidden, hidden)
		}
	}
	post("/api/plugin-pages/hidden", `{"hidden":["plugin-rtk"," plugin-rtk",""]}`)
	want([]string{"plugin-rtk"})
	post("/api/settings", `{"theme":"dark"}`)
	want([]string{"plugin-rtk"})
	post("/api/plugin-pages/hidden", `{}`)
	want([]string{"plugin-rtk"})
	post("/api/plugin-pages/hidden", `{"hidden":[]}`)
	want(nil)
}

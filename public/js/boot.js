
// SPA entry. theme-preload.js ran before styles.css; this module bootstraps
// the app: session fetch, router mount, stale-build checks (state.js).
import { boot } from "./state.js";

boot();

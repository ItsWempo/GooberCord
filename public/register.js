// Local-preview auth page: register + login against the real GooberCord API.
// Dev-only stopgap — it exists so the app can be exercised in a browser before
// the Task 11 interface lands. GooberCord mints the session on register/login
// (no guest sessions), so no CSRF token is needed up front; the register/login
// response sets the goober_session cookie.
// Turnstile here uses Cloudflare's OFFICIAL local-dev dummy tokens
// (XXXX.DUMMY.PASS.TOKEN.XXXX against the 1x...AA dummy secret configured in
// .dev.vars) — the production keep is the real widget in the Task 11 UI.
(() => {
  const DEV_PASS_TOKEN = "XXXX.DUMMY.PASS.TOKEN.XXXX";

  function feedback(text, ok) {
    const el = document.querySelector("#feedback");
    el.textContent = text;
    el.className = ok ? "ok" : "err";
  }

  async function post(url, body, successLine) {
    body["cf-turnstile-response"] = DEV_PASS_TOKEN;
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      feedback(response.ok ? successLine : data.error || "Failed (" + response.status + ")", response.ok);
      if (response.ok) whoAmI();
    } catch (err) {
      feedback("Network error: " + err.message, false);
    }
  }

  document.querySelector("#register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback("Creating…", true);
    await post("/api/auth/register", {
      username: document.querySelector("#reg-username").value.trim(),
      password: document.querySelector("#reg-password").value,
    }, "Account created!");
  });

  document.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback("Signing in…", true);
    await post("/api/auth/login", {
      username: document.querySelector("#login-username").value.trim(),
      password: document.querySelector("#login-password").value,
    }, "Signed in!");
  });

  async function whoAmI() {
    const response = await fetch("/api/me", { credentials: "same-origin" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.user) {
      document.querySelector("#whoami").textContent = "Signed in as " + data.user.username + ".";
    }
  }
})();

// The Goober Coin shop (0011) — blaxel's counter, rendered from state.js's
// dispatch on "#/shop". One page, three panels:
//   balance + today's earn against the ONE daily ceiling (+ the CLAIM button —
//     the daily activity grant's single consistent surface),
//   the Goober+ bundle (ONE bundle, MONTHLY renewal inside a grace window,
//     boosts stay free) with the renewal button and the GIFT form,
//   the member's own ledger (delta rows, bare-id cursor, load-more),
//   and nothing else: coins are earned only by activity, never purchased —
//   no purchase affordance exists anywhere in the UI, by owner decree.
// CSP discipline: every node rides el()/textContent (never innerHTML); the
// progress bar's fill width is a CSS CLASS, never an inline style string.
import { api } from "../api.js";
import { el, formatTimestamp } from "../dom.js";
import { iconButton } from "../icons.js";
import { mascotMoment } from "../mascot.js";
import {
  coinBalanceLabel,
  coinDayProgress,
  giftUsernameValid,
  ledgerEntryCopy,
  plusStateCopy,
} from "../ui-helpers.js";

// The progress bar's fill widths land on a 5% grid (a class per step), so
// style-src 'self' stays intact and the visual never lies about more than
// rounding.
function progressClass(pct) {
  const stepped = Math.round(Math.max(0, Math.min(100, Number(pct) || 0)) / 5) * 5;
  return "shop-progress-fill shop-progress-" + stepped;
}

function shopShell(doc, win) {
  const app = doc.getElementById("app");

  const back = iconButton(doc, "home", {
    className: "icon-button button-quiet",
    ariaLabel: "Back to GooberCord",
  });
  back.addEventListener("click", () => {
    win.location.hash = "#/";
  });

  const error = el("p", { class: "error-strip", role: "alert" });
  const status = el("p", { class: "success-copy", role: "status" });
  const content = el("div", { class: "shop-body" });

  const panel = el("section", { class: "panel shop-panel" },
    el("div", { class: "form-actions review-back-row" }, back),
    el("h1", { class: "review-heading", text: "Goober Shop" }),
    el("p", {
      class: "muted",
      text: "Coins are earned only by being here — chats, voice time, and the daily grant. Never sold.",
    }),
    el("div", { class: "shop-hero" },
      mascotMoment(doc, { mood: "idle", size: "mid", sparkle: true }),
      el("p", { class: "shop-hero-blurb", text: "blaxel keeps the coin counter and the Goober+ bundle." }),
    ),
    error,
    status,
    content,
  );

  const screen = el("div", { class: "auth-screen place-start-center discover-screen" }, panel);
  app.replaceChildren(screen);
  return { content, error, status };
}

// --- panel: balance + daily claim + today's earn --------------------------------

function renderBalancePanel(snapshot, reload, error, status) {
  const progress = coinDayProgress(snapshot.earnedToday, snapshot.dailyCeiling);
  const claimed = Boolean(snapshot.daily?.claimedToday);
  const grant = Number(snapshot.daily?.grant) || 0;

  const claim = el("button", {
    class: "button button-primary shop-claim",
    type: "button",
    text: claimed ? "Claimed today" : "Claim the daily grant (+" + grant + ")",
  });
  if (claimed) {
    claim.disabled = true;
    claim.title = "Come back tomorrow — the grant is once per UTC day.";
  } else {
    claim.addEventListener("click", async () => {
      error.textContent = "";
      claim.disabled = true;
      try {
        await api("/api/coins/claim", { method: "POST" });
        status.textContent = "Daily grant claimed. Coins never expire.";
        void reload();
      } catch (caught) {
        claim.disabled = false;
        error.textContent = caught?.message || "The claim could not be saved.";
      }
    });
  }

  return el("section", { class: "panel shop-balance" },
    el("h2", { text: "Your balance" }),
    el("p", { class: "shop-balance-figure", text: coinBalanceLabel(snapshot.balance) + " Goober Coins" }),
    el("p", {
      class: "muted shop-balance-detail",
      text: "Earned today: " + progress.label + " of the shared daily ceiling.",
      title: progress.title,
    }),
    el("div", { class: "shop-progress", role: "img", "aria-label": progress.title },
      el("div", { class: progressClass(progress.pct) }),
    ),
    claim,
  );
}

// --- panel: the Goober+ bundle ---------------------------------------------------

function renderBundlePanel(plus, bundle, reload, error, status) {
  const standing = plusStateCopy(plus, (millis) => formatTimestamp(millis));

  const renew = el("button", {
    class: "button button-primary",
    type: "button",
    text: "Renew for " + bundle.price + " coins (+" + bundle.termDays + " days)",
  });
  renew.addEventListener("click", async () => {
    error.textContent = "";
    renew.disabled = true;
    try {
      await api("/api/plus/renew", { method: "POST" });
      status.textContent = "Goober+ renewed — a fresh month, tenure untouched.";
      void reload();
    } catch (caught) {
      renew.disabled = false;
      error.textContent = caught?.message || "The renewal could not be saved.";
    }
  });

  // The gift form: the gifter's own coins buy the CHOSEN member's term.
  const nameInput = el("input", {
    type: "text",
    class: "shop-gift-input",
    placeholder: "member to gift…",
    "aria-label": "Member to gift Goober+ to",
    autocomplete: "off",
    spellcheck: "false",
    maxlength: "24",
  });
  const giftButton = el("button", { class: "button button-secondary", type: "submit", text: "Gift" });
  const giftForm = el("form", { class: "shop-gift" }, nameInput, giftButton);
  giftForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    status.textContent = "";
    const username = nameInput.value.trim();
    if (!giftUsernameValid(username)) {
      error.textContent = "Usernames are 3–24 letters, numbers, or underscores.";
      return;
    }
    giftButton.disabled = true;
    try {
      await api("/api/plus/gift", { method: "POST", body: { username } });
      status.textContent = "Goober+ gift sent to @" + username + " — the ledger keeps the trail.";
      nameInput.value = "";
      void reload();
    } catch (caught) {
      giftButton.disabled = false;
      error.textContent = caught?.message || "The gift could not be sent.";
    }
  });

  const perks = el("ul", { class: "shop-perks" },
    ...(bundle.perks || []).map((perk) => el("li", { text: perk })),
  );

  return el("section", { class: "panel shop-plus" },
    el("h2", { text: bundle.name }),
    el("p", {
      class: "muted shop-plus-price",
      text: bundle.price + " coins per month · renew anytime · " + bundle.graceDays + "-day grace",
    }),
    perks,
    el("p", { class: "muted", text: standing.title + " — " + standing.detail }),
    renew,
    el("p", { class: "muted shop-plus-note", text: bundle.note }),
    el("h3", { text: "Gift Goober+" }),
    el("p", {
      class: "muted",
      text: "Spend your own coins to gift a month to another member. Gifting yourself is a renewal.",
    }),
    giftForm,
  );
}

// --- panel: the ledger ------------------------------------------------------------

function ledgerRowFor(entry) {
  const copy = ledgerEntryCopy(entry);
  return el("div", { class: "shop-ledger-row", role: "listitem" },
    el("span", { class: "shop-ledger-label", text: copy.label }),
    el("span", {
      class: "shop-ledger-amount" + (copy.negative ? " shop-ledger-negative" : ""),
      text: copy.amount,
    }),
    el("span", {
      class: "shop-ledger-date muted",
      text: entry.createdAt ? formatTimestamp(entry.createdAt) : "",
    }),
  );
}

// --- the page ---------------------------------------------------------------------

export function renderShopPage(doc = document, win = window) {
  const { content, error, status } = shopShell(doc, win);
  // Page-scoped ledger state: pages are appended client-side; a reload starts
  // the walk over.
  const ledger = { entries: [], nextAfter: null, done: false };
  let bundle = null;

  const ledgerRowsNode = el("div", { class: "shop-ledger-rows" });
  const loadMore = el("button", { class: "button button-quiet", type: "button", text: "Load more" });
  loadMore.addEventListener("click", async () => {
    error.textContent = "";
    loadMore.disabled = true;
    try {
      await loadLedgerPage({ append: true, before: ledger.nextAfter });
      ledgerRowsNode.replaceChildren(...ledger.entries.map(ledgerRowFor));
      loadMore.disabled = ledger.done;
      if (ledger.done) loadMore.hidden = true;
    } catch (caught) {
      loadMore.disabled = false;
      error.textContent = caught?.message || "The ledger page could not be loaded.";
    }
  });

  const ledgerPanel = el("section", {
    class: "panel shop-ledger",
    role: "list",
    "aria-label": "Your coin ledger",
  },
    el("h2", { text: "Ledger" }),
    el("p", { class: "muted", text: "Every movement is a delta — your balance is exactly their sum." }),
    ledgerRowsNode,
    el("p", { class: "muted shop-ledger-empty", text: "Nothing yet. Claim the daily grant to start." }),
    loadMore,
  );
  const ledgerEmpty = ledgerPanel.querySelector(".shop-ledger-empty");

  const loadLedgerPage = async ({ append = false, before = null } = {}) => {
    const query = before === null ? "" : "?before=" + before;
    const payload = await api("/api/coins/ledger" + query);
    const rows = payload?.entries || [];
    ledger.entries = append ? [...ledger.entries, ...rows] : rows;
    ledger.nextAfter = payload.nextAfter ?? null;
    ledger.done = !payload.nextAfter || rows.length === 0;
    return rows;
  };

  const reload = async () => {
    for (const old of content.children) old.remove();
    for (const node of [ledgerRowsNode, loadMore]) node.replaceChildren();
    loadMore.textContent = "Load more";
    try {
      const [snapshot] = await Promise.all([
        api("/api/coins"),
        loadLedgerPage().catch(() => {}),
        // The bundle copy rides the shop read (the same source the API owns);
        // a refusal keeps the page readable minus the bundle.
        api("/api/coins/shop").then((payload) => {
          bundle = payload?.bundle || null;
        }).catch(() => {}),
      ]);
      if (!snapshot) throw new Error("Your coins could not be loaded.");
      ledgerRowsNode.replaceChildren(...ledger.entries.map(ledgerRowFor));
      ledgerEmpty.hidden = ledger.entries.length > 0;
      loadMore.hidden = ledger.done || ledger.entries.length === 0;
      if (!ledger.done) loadMore.removeAttribute("title");
      content.append(
        renderBalancePanel(snapshot, reload, error, status),
        bundle
          ? renderBundlePanel(snapshot.plus, bundle, reload, error, status)
          : el("p", { class: "muted", text: "The bundle could not be loaded right now." }),
        ledgerPanel,
      );
    } catch (caught) {
      content.append(
        mascotMoment(null, {
          mood: "sheepish",
          size: "mid",
          error: true,
          text: caught?.message || "The shop could not be loaded. Try again in a moment.",
        }),
      );
    }
  };

  void reload();
}

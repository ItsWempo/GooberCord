// Copyright 2026 YourLocalGoober
//
// This file is part of GooberCord.
//
// GooberCord is free software: you can redistribute it and/or modify it
// under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the
// GNU Affero General Public License along with this program.  If not,
// see <https://www.gnu.org/licenses/>

// Request-storm regression (the friends-hub fetch/render recursion): the
// pin is behavioral, on the real client module — a FAILED social refresh
// re-renders nothing, performs exactly ONE fetch round per render, and the
// in-flight guard collapses a concurrent render's lazy fetch into the one
// already running. The old shape (always re-render once the fetch settled)
// drove the loop this test refuses: hub renders with null caches → lazy
// fetch → fetch fails → rerender → null caches again → fetch again... one
// fetch round per render is the whole invariant, and a failed fetch must
// never produce another render.
import test from "node:test";
import assert from "node:assert/strict";

import { refreshSocial } from "../public/js/routes/app.js";

// The fetch counter + controller: every round of refreshSocial rides exactly
// two fetches (/api/friends and /api/blocks).
function installFetch(mode) {
  const calls = [];
  const pending = [];
  globalThis.fetch = (path) => {
    calls.push(String(path));
    if (mode === "fail") {
      return Promise.reject(new Error("down"));
    }
    if (mode === "manual") {
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    }
    if (path.includes("/api/blocks")) {
      return Promise.resolve(new Response(JSON.stringify({ blocked: [] }), { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ friends: [], pendingSent: [], pendingReceived: [] }), { status: 200 }),
    );
  };
  return {
    calls,
    pending,
    settleAllFailures: () => {
      for (const entry of pending.splice(0)) entry.reject(new Error("down"));
    },
    restore: () => {
      delete globalThis.fetch;
    },
  };
}

// A main stub and doc that record the re-render ATTEMPT: refreshSocial's
// rerender path starts with doc.querySelector(".gc-main"), so querying the
// element proves the path ran even while the stub itself refuses to be
// replaced (isConnected: false keeps node DOM-free).
function installDoc() {
  const events = { mainQueried: false, replaced: 0 };
  const main = {
    isConnected: false,
    replaceChildren() {
      events.replaced += 1;
    },
  };
  const doc = {
    querySelector(selector) {
      if (selector === ".gc-main") events.mainQueried = true;
      return main;
    },
  };
  return { doc, events };
}

const WIN = { location: { hash: "#/" } };

test("a failed social refresh performs exactly ONE fetch round and never re-renders", async () => {
  const fake = installFetch("fail");
  try {
    const { doc, events } = installDoc();
    await refreshSocial(doc, WIN, { rerender: true });
    assert.deepEqual(
      fake.calls.filter((call) => call.includes("/api/friends")).length,
      1,
      "one /api/friends attempt",
    );
    assert.deepEqual(
      fake.calls.filter((call) => call.includes("/api/blocks")).length,
      1,
      "one /api/blocks attempt",
    );
    assert.equal(
      events.mainQueried,
      false,
      "a failed refresh must not even attempt the re-render — the render is what re-fired the fetch",
    );
    assert.equal(events.replaced, 0);
  } finally {
    fake.restore();
  }
});

test("a concurrent render's lazy fetch collapses into the one already in flight", async () => {
  const fake = installFetch("manual");
  try {
    const { doc } = installDoc();
    const first = refreshSocial(doc, WIN, { rerender: true });
    const second = refreshSocial(doc, WIN, { rerender: true });

    assert.equal(fake.pending.length, 2, "exactly one round in flight (friends + blocks)");
    fake.settleAllFailures();
    await Promise.all([first, second]);
    assert.equal(fake.calls.length, 2, "the second render requested no second round");
  } finally {
    fake.restore();
  }
});

test("the in-flight guard clears once settled — a later render may fetch again", async () => {
  const fake = installFetch("fail");
  try {
    const { doc } = installDoc();
    await refreshSocial(doc, WIN, { rerender: true });
    await refreshSocial(doc, WIN, { rerender: true });
    assert.equal(fake.calls.filter((call) => call.includes("/api/friends")).length, 2,
      "each render gets its own one-round budget; the guard is not a permanent lockout");
  } finally {
    fake.restore();
  }
});

test("a landed payload still drives the rerender — the guards only bind failures", async () => {
  const fake = installFetch("succeed");
  try {
    const { doc, events } = installDoc();
    await refreshSocial(doc, WIN, { rerender: true });
    assert.equal(fake.calls.filter((call) => call.includes("/api/friends")).length, 1);
    assert.equal(events.mainQueried, true, "the landed payload's rerender ran");
    // isConnected: false keeps the re-render itself out of node's DOM reach.
    assert.equal(events.replaced, 0);
  } finally {
    fake.restore();
  }
});

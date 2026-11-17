// Vendor parity (framework migration phase 1): public/js/vendor/ carries
// Project Designer's frontload kit, and the kit is the source of record —
// the GC copies must only differ from it by the allow-listed vendoring
// banner, never by code. This pins the CLIENT-side vendored half against
// /Users/itswempo/project-designer/frontload/, mirroring how
// tests/contract-parity.test.mjs pins api/core/auth.mjs against the forum.
//
// Allow-listed substitutions ONLY:
//   the vendoring banner prepended to each GC copy (a fixed 5-line block
//   ending at the kit's own "// Project Designer — frontload/<name>" header)
// Everything else must be character-for-character identical.

import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const VENDOR_DIR = path.resolve(HERE, "../public/js/vendor");
const KIT_DIR = "/Users/itswempo/project-designer/frontload";

// The kit's own header line starts each source file; stripping everything
// before it removes exactly the GC vendoring banner (and nothing else).
const KIT_HEADER_MARKER = "// Project Designer — frontload/";

function readVendor(name) {
  return readFileSync(path.join(VENDOR_DIR, name), "utf-8");
}

function readKit(name) {
  return readFileSync(path.join(KIT_DIR, name), "utf-8");
}

function vendorize(text) {
  const marker = text.indexOf(KIT_HEADER_MARKER);
  assert.ok(marker > 0, "the vendored copy carries the GC banner before the kit header");
  return text.slice(marker);
}

for (const name of ["dom.mjs", "tokens.mjs"]) {
  test(`${name} is byte-identical to the frontload kit after banner substitution`, () => {
    // The whole-file gate: the vendored copy differs from the source of
    // record by the banner and NOTHING else — an in-place edit of the kit
    // code fails here instead of silently forking the framework.
    assert.equal(vendorize(readVendor(name)), readKit(name));

    // Localize a failure too: any GC-side line changed WITHOUT the kit's
    // line naming it shows up here (the kit files evolve; whole-file equality
    // alone doesn't say WHICH copy drifted).
    const vendorLines = vendorize(readVendor(name)).split("\n");
    const kitLines = readKit(name).split("\n");
    assert.equal(vendorLines.length, kitLines.length, "same line count after substitution");
    for (let i = 0; i < kitLines.length; i++) {
      assert.equal(vendorLines[i], kitLines[i], `line ${i + 1}`);
    }
  });
}

// The banner itself is a contract: it must name the strip marker so the
// substitution is honest, and never sit BELOW the kit header (where it
// would masquerade as kit code).
test("the vendoring_banner sits exactly once, above the kit header", () => {
  for (const name of ["dom.mjs", "tokens.mjs"]) {
    const text = readVendor(name);
    assert.equal((text.match(/VENDORED VERBATIM/g) || []).length, 1, name);
    assert.ok(text.startsWith("// VENDORED VERBATIM"), name + " starts with the banner");
    assert.ok(text.indexOf(KIT_HEADER_MARKER) > text.indexOf("VENDORED VERBATIM"), name);
  }
});

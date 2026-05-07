import assert from "node:assert/strict";
import test from "node:test";

import { conductorKey } from "../src/conductorKey.js";

test("conductorKey lowercases and trims parts", () => {
  assert.equal(conductorKey("  Marie  ", " CURIE "), "marie.curie@local");
});

test("conductorKey uses defaults for empty input", () => {
  assert.equal(conductorKey("", ""), "conducteur.bus@local");
});

test("conductorKey preserves diacritics in local part (trim only)", () => {
  assert.equal(conductorKey("José", "García"), "josé.garcía@local");
});

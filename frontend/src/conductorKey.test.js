import { describe, expect, it } from "vitest";

import { conductorKey } from "./conductorKey.js";

describe("conductorKey", () => {
  it("lowercases and trims name parts", () => {
    expect(conductorKey("  Admin  ", " Test ")).toBe("admin.test@local");
  });

  it("falls back to conducteur.bus when empty", () => {
    expect(conductorKey("", "")).toBe("conducteur.bus@local");
  });

  it("handles only first name", () => {
    expect(conductorKey("Solo", "")).toBe("solo.bus@local");
  });
});

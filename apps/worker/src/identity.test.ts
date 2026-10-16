import { describe, expect, it } from "vitest";
import { createWorkerIdentity } from "./identity";

describe("createWorkerIdentity", () => {
  it("bildet eine stabile, lesbare ID aus Rechnername und UUID", () => {
    const id = createWorkerIdentity("DESKTOP_PC 01", "3f9c1a2b-0000-4000-8000-000000000000");
    expect(id.workerId).toBe("desktop-pc-01:3f9c1a2b");
  });

  it("erzeugt pro Prozessstart unterschiedliche IDs", () => {
    expect(createWorkerIdentity("pc").workerId).not.toBe(createWorkerIdentity("pc").workerId);
  });
});

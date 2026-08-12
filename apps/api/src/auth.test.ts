import {describe, expect, it} from "vitest";
import {issueToken, verifyToken} from "./auth.js";
describe("auth", () => {
  it("roundtrips tokens", () => {
    const {token} = issueToken({sub:"dev_x", installId:"install-123456"}, "secret", 3600);
    expect(verifyToken(token, "secret")?.sub).toBe("dev_x");
    expect(verifyToken(token, "wrong")).toBeNull();
  });
});

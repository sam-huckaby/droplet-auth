import { describe, expect, it } from "vitest";
import { ConfigError, parseAllowedApps, parseAuthOrigin, validateReturnTo } from "../src/env";

describe("env parsing", () => {
  it("parses AUTH_ORIGIN", () => {
    expect(parseAuthOrigin("https://auth.example.com").origin).toBe("https://auth.example.com");
  });

  it("rejects invalid AUTH_ORIGIN", () => {
    expect(() => parseAuthOrigin("http://auth.example.com")).toThrow(ConfigError);
  });

  it("parses ALLOWED_APPS", () => {
    expect(parseAllowedApps('{"photos":"https://photos.example.com"}')).toEqual({
      photos: "https://photos.example.com",
    });
  });

  it("rejects mismatched return origins", () => {
    const apps = { photos: "https://photos.example.com" };
    expect(() => validateReturnTo(apps, "photos", "https://evil.example.com/")).toThrow(ConfigError);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_FILE_TTL_SECONDS, DEFAULT_MAX_UPLOAD_BYTES, parseMaxUploadBytes, parsePositiveInteger } from "../src/env";

describe("upload limits", () => {
  it("uses 1 GiB default", () => {
    expect(parseMaxUploadBytes(undefined)).toBe(DEFAULT_MAX_UPLOAD_BYTES);
  });

  it("accepts configured positive integer", () => {
    expect(parseMaxUploadBytes("1024")).toBe(1024);
  });

  it("uses 7 day default file TTL", () => {
    expect(parsePositiveInteger(undefined, "FILE_TTL_SECONDS", DEFAULT_FILE_TTL_SECONDS)).toBe(604800);
  });
});

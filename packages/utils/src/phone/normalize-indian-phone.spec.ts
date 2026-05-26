import { describe, it, expect } from "vitest";
import { normalizeIndianPhoneNumber } from "./normalize-indian-phone";

describe("normalizeIndianPhoneNumber", () => {
  it("should normalize standard 10-digit number by adding +91", () => {
    expect(normalizeIndianPhoneNumber("9876543210")).toBe("+919876543210");
  });

  it("should normalize standard +91 prefixed number", () => {
    expect(normalizeIndianPhoneNumber("+919876543210")).toBe("+919876543210");
  });

  it("should normalize number with spaces", () => {
    expect(normalizeIndianPhoneNumber("91 98765 43210")).toBe("+919876543210");
  });

  it("should normalize number with leading zero", () => {
    expect(normalizeIndianPhoneNumber("09876543210")).toBe("+919876543210");
  });

  it("should normalize number with hyphens", () => {
    expect(normalizeIndianPhoneNumber("+91-9876543210")).toBe("+919876543210");
  });

  it("should throw error for empty phone number", () => {
    expect(() => normalizeIndianPhoneNumber("")).toThrow(
      "Phone number is required",
    );
  });

  it("should throw error for invalid numbers", () => {
    expect(() => normalizeIndianPhoneNumber("12345")).toThrow(
      "Invalid Indian phone number",
    );
    expect(() => normalizeIndianPhoneNumber("+91123456789")).toThrow(
      "Invalid Indian phone number",
    );
    expect(() => normalizeIndianPhoneNumber("987654321")).toThrow(
      "Invalid Indian phone number",
    );
    expect(() => normalizeIndianPhoneNumber("+915876543210")).toThrow(
      "Invalid Indian phone number",
    ); // Starts with 5, not 6-9
  });
});

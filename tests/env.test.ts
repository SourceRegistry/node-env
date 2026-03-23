import {beforeEach, describe, expect, it, vi} from "vitest";
import * as fs from "fs";

vi.mock("fs");

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockExistsSync = vi.mocked(fs.existsSync);

let env: typeof import("../src").env;

describe("env library", () => {
    beforeEach(async () => {
        delete process.env.TEST;
        delete process.env.NUMBER;
        delete process.env.QUOTED;
        delete process.env.BOOL;
        delete process.env.MALFORMED;
        delete process.env.EXPORTED;
        delete process.env.INVALID_NUMBER;
        delete process.env.INVALID_URL;
        delete process.env.PUBLIC_SESSION_SAME_SITE;
        vi.resetModules();
        vi.clearAllMocks();
    });

    it("loads .env successfully and parses variables", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(`TEST=hello\nNUMBER=42\nQUOTED="value"\nexport EXPORTED=yes\nMALFORMED`);

        env = (await import("../src")).env;
        expect(env.string("TEST")).toBe("hello");
        expect(env.number("NUMBER")).toBe(42);
        expect(env.string("QUOTED")).toBe("value");
        expect(env.string("EXPORTED")).toBe("yes");
        expect(env.has("MALFORMED")).toBe(false);
    });

    it("handles missing .env gracefully", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(env.string("MISSING", "fallback")).toBe("fallback");
    });

    it("handles invalid .env parsing errors", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => {
            throw new Error("File read failed");
        });
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {
        });
        env = (await import("../src")).env;
        expect(spy).toHaveBeenCalledWith("File read failed");
    });

    it("returns default values and type conversions", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        expect(env.string("MISSING_STR", "abc")).toBe("abc");
        expect(env.enum("MISSING_ENUM", ["strict", "lax", "none"] as const, "lax")).toBe("lax");
        expect(env.number("MISSING_NUM", 123)).toBe(123);
        expect(env.boolean("MISSING_BOOL", true)).toBe(true);
    });

    it("returns existing enum value when valid", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).PUBLIC_SESSION_SAME_SITE = "none";
        env = (await import("../src")).env;
        expect(env.enum("PUBLIC_SESSION_SAME_SITE", ["strict", "lax", "none"] as const, "lax")).toBe("none");
    });

    it("falls back to enum default when existing value is invalid", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).PUBLIC_SESSION_SAME_SITE = "invalid";
        env = (await import("../src")).env;
        expect(env.enum("PUBLIC_SESSION_SAME_SITE", ["strict", "lax", "none"] as const, "lax")).toBe("lax");
        expect(process.env.PUBLIC_SESSION_SAME_SITE).toBe("lax");
    });

    it("throws when enum default is not allowed", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(() =>
            env.enum("PUBLIC_SESSION_SAME_SITE", ["strict", "lax", "none"] as const, "invalid" as any)
        ).toThrow("Enum default must be one of the allowed values");
    });

    it("throws when enum values are empty", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(() =>
            env.enum("PUBLIC_SESSION_SAME_SITE", [] as any, "lax")
        ).toThrow("Enum values must contain at least one item");
    });

    it("throws when enum values contain empty entries", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(() =>
            env.enum("PUBLIC_SESSION_SAME_SITE", ["strict", ""] as any, "strict")
        ).toThrow("Enum values must be non-empty strings");
    });

    it("detects existing and defined keys", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        env.string("SOME_KEY", "value");
        expect(env.has("SOME_KEY")).toBe(true);
        expect(env.defined("SOME_KEY")).toBe(true);
    });

    it("returns dev true unless NODE_ENV=production", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.NODE_ENV = "development";
        env = (await import("../src")).env;
        expect(env.dev).toBe(true);
        process.env.NODE_ENV = "production";
        expect(env.dev).toBe(false);
    });

    it("handles boolean parsing correctly", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        (process.env as any).FLAG_TRUE = " true ";
        (process.env as any).FLAG_ONE = "1";
        (process.env as any).FLAG_FALSE = "false";
        expect(env.boolean("FLAG_TRUE")).toBe(true);
        expect(env.boolean("FLAG_ONE")).toBe(true);
        expect(env.boolean("FLAG_FALSE")).toBe(false);
    });

    it("handles URL parsing correctly", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        (process.env as any).API_ENDPOINT = "http://localhost:8080/";
        expect(env.url("API_ENDPOINT")).toBeInstanceOf(URL);
    });

    it("falls back and normalizes invalid number values", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).INVALID_NUMBER = "NaN";
        env = (await import("../src")).env;
        expect(env.number("INVALID_NUMBER", 123)).toBe(123);
        expect(process.env.INVALID_NUMBER).toBe("123");
    });

    it("falls back and normalizes invalid URL values", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).INVALID_URL = "not-a-url";
        env = (await import("../src")).env;
        expect(env.url("INVALID_URL", new URL("https://example.com"))).toEqual(new URL("https://example.com"));
        expect(process.env.INVALID_URL).toBe("https://example.com/");
    });

    it("creates collection with and without prefix removal", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).APP_FOO = "bar";
        (process.env as any).APP_BAR = "baz";
        env = (await import("../src")).env;
        const all = env.collection("APP_");
        const stripped = env.collection("APP_", {removePrefix: true});
        expect(all.APP_FOO).toBe("bar");
        expect(stripped.FOO).toBe("bar");
    });

    it("applies reviver function in collection", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).CFG_ONE = "10";
        env = (await import("../src")).env;
        const parsed = env.collection("CFG_", {
            reviver: (v) => Number(v) * 2,
        });
        expect(parsed.CFG_ONE).toBe(20);
    });

    it("utils.select chooses based on boolean predicate", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).FEATURE_ENABLED = "true";
        env = (await import("../src")).env;
        const result = env.utils.select("FEATURE_ENABLED", "ON", "OFF");
        expect(result).toBe("ON");
        const inverse = env.utils.select(
            "FEATURE_ENABLED",
            "ON",
            "OFF",
            () => false
        );
        expect(inverse).toBe("OFF");
    });

    it("utils.select passes the key and raw value to a custom predicate", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).FEATURE_ENABLED = "custom";
        env = (await import("../src")).env;
        const predicate = vi.fn((key: string, value: string | undefined) =>
            key === "FEATURE_ENABLED" && value === "custom"
        );
        expect(env.utils.select("FEATURE_ENABLED", "ON", "OFF", predicate)).toBe("ON");
        expect(predicate).toHaveBeenCalledWith("FEATURE_ENABLED", "custom");
    });

    it("raw to return an object", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue("TEST=hello");
        env = (await import("../src")).env;
        expect(env.raw).toBeTypeOf('object');
        expect(() => ((env.raw as any).TEST = "changed")).toThrow();
        expect(env.raw.TEST).toBe("hello");
    });

    it("throws on invalid empty keys", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(() => env.string("" as any, "fallback")).toThrow("Environment key must be a non-empty string");
        expect(() => env.has("   " as any)).toThrow("Environment key must be a non-empty string");
    });

    it("throws on non-finite number defaults", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(() => env.number("PORT", Number.NaN)).toThrow("Number default must be a finite number");
    });

    it("assert throws error when required keys are missing (default error)", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        // Define one key
        env.string("EXISTING_KEY", "present");

        // Assert on a missing key
        expect(() => env.assert(["MISSING_KEY"])).toThrow(
            'Missing required keys(MISSING_KEY) in environment'
        );
    });

    it("assert throws custom error when required keys are missing", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        const customErrorBuilder = (missing: string[]) =>
            new Error(`Custom: ${missing.join(", ")} are missing!`);

        expect(() => env.assert(["A", "B"], customErrorBuilder)).toThrow(
            "Custom: A, B are missing!"
        );
    });

    it("assert throws custom string error (converted to Error)", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        const stringErrorBuilder = (missing: string[]) =>
            `STRING ERROR: missing ${missing.join("+")}`;

        expect(() => env.assert(["X"], stringErrorBuilder)).toThrow(
            "STRING ERROR: missing X"
        );
    });

    it("assert does nothing when all required keys exist", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        env.string("KEY1", "val1");
        env.string("KEY2", "val2");

        // Should not throw
        expect(() => env.assert(["KEY1", "KEY2"])).not.toThrow();
    });
});

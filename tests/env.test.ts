import { beforeEach, describe, expect, it, vi } from "vitest";
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
        vi.resetModules();
        vi.clearAllMocks();
    });

    it("loads .env successfully and parses variables", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(`TEST=hello\nNUMBER=42\nQUOTED="value"`);

        env = (await import("../src")).env;
        expect(env.string("TEST")).toBe("hello");
        expect(env.number("NUMBER")).toBe(42);
        expect(env.string("QUOTED")).toBe("value");
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
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
        env = (await import("../src")).env;
        expect(spy).toHaveBeenCalledWith("File read failed");
    });

    it("returns default values and type conversions", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        expect(env.string("MISSING_STR", "abc")).toBe("abc");
        expect(env.number("MISSING_NUM", 123)).toBe(123);
        expect(env.boolean("MISSING_BOOL", true)).toBe(true);
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
        (process.env as any).FLAG_TRUE = "true";
        (process.env as any).FLAG_ONE = "1";
        (process.env as any).FLAG_FALSE = "false";
        expect(env.boolean("FLAG_TRUE")).toBe(true);
        expect(env.boolean("FLAG_ONE")).toBe(true);
        expect(env.boolean("FLAG_FALSE")).toBe(false);
    });

    it("creates collection with and without prefix removal", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).APP_FOO = "bar";
        (process.env as any).APP_BAR = "baz";
        env = (await import("../src")).env;
        const all = env.collection("APP_");
        const stripped = env.collection("APP_", { removePrefix: true });
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

    it("raw to return an object", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(env.raw).toBeTypeOf('object');
    });
});

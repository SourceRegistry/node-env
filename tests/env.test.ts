import {beforeEach, describe, expect, expectTypeOf, it, vi} from "vitest";
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
        delete process.env.PORT;
        delete process.env.DATABASE_URL;
        delete process.env.ENABLE_CACHE;
        delete process.env.LOG_LEVEL;
        delete process.env.PUBLIC_ALLOWED_HOSTS;
        delete process.env.PUBLIC_TRUSTED_PROXIES;
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

    it("parses production-style dotenv values with comments, escapes, and invalid keys ignored", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(
            "\uFEFFGOOD=value # trailing comment\n" +
            "JSON=\"{\\\"ok\\\":true}\"\n" +
            "MULTILINE=\"hello\\nworld\"\n" +
            "SINGLE='single quoted value'\n" +
            "HASH_IN_DOUBLE=\"value # keep\"\n" +
            "HASH_IN_SINGLE='value # keep'\n" +
            "NO_SPACE_HASH=value#keep\n" +
            "ONLY_COMMENT=# comment only\n" +
            "PARTIAL_DOUBLE=foo\"bar#baz\" # trailing comment\n" +
            "PARTIAL_SINGLE=foo'bar#baz' # trailing comment\n" +
            "LOWER_case=ignored\n" +
            "1INVALID=ignored\n"
        );

        env = (await import("../src")).env;
        expect(env.string("GOOD")).toBe("value");
        expect(env.string("JSON")).toBe("{\"ok\":true}");
        expect(env.string("MULTILINE")).toBe("hello\nworld");
        expect(env.string("SINGLE")).toBe("single quoted value");
        expect(env.string("HASH_IN_DOUBLE")).toBe("value # keep");
        expect(env.string("HASH_IN_SINGLE")).toBe("value # keep");
        expect(env.string("NO_SPACE_HASH")).toBe("value#keep");
        expect(env.string("ONLY_COMMENT")).toBe("");
        expect(env.string("PARTIAL_DOUBLE")).toBe("foo\"bar#baz\"");
        expect(env.string("PARTIAL_SINGLE")).toBe("foo'bar#baz'");
        expect(process.env.LOWER_case).toBeUndefined();
        expect(process.env["1INVALID"]).toBeUndefined();
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

    it("uses global logger when dotenv loading fails", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => {
            throw new Error("Logged through global logger");
        });
        const warn = vi.fn();
        (globalThis as any).logger = {warn};

        env = (await import("../src")).env;

        expect(warn).toHaveBeenCalledWith("Logged through global logger");
        delete (globalThis as any).logger;
    });

    it("falls back to the default dotenv load error message when no message exists", async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => {
            throw null;
        });
        const spy = vi.spyOn(console, "warn").mockImplementation(() => {
        });

        env = (await import("../src")).env;

        expect(spy).toHaveBeenCalledWith("Failed to load .env");
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

    it("falls back and normalizes invalid boolean values", async () => {
        mockExistsSync.mockReturnValue(false);
        (process.env as any).BOOL = "not-a-bool";
        env = (await import("../src")).env;
        expect(env.boolean("BOOL", true)).toBe(true);
        expect(process.env.BOOL).toBe("true");
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

    it("throws when url default is invalid", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(() => env.url("INVALID_URL", "notaurl" as any)).toThrow("URL default must be a valid URL");
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

    it("throws on non-uppercase keys", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;
        expect(() => env.string("lowercase" as any, "fallback")).toThrow(
            "Environment key must be uppercase and contain only letters, numbers, and underscores"
        );
        expect(() => env.collection("mixed_Case" as any)).toThrow(
            "Environment key must be uppercase and contain only letters, numbers, and underscores"
        );
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

    it("parses a production env schema with coercion and defaults", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.PORT = "8080";
        process.env.DATABASE_URL = "https://db.example.com";
        process.env.LOG_LEVEL = "warn";
        env = (await import("../src")).env;

        const config = env.schema.parse(env.schema.object({
            PORT: env.schema.number({integer: true, min: 1}),
            DATABASE_URL: env.schema.url({protocols: ["https:"]}),
            ENABLE_CACHE: env.schema.boolean({default: false}),
            LOG_LEVEL: env.schema.enum(["debug", "info", "warn", "error"] as const),
        }));

        expect(config.PORT).toBe(8080);
        expect(config.DATABASE_URL).toEqual(new URL("https://db.example.com"));
        expect(config.ENABLE_CACHE).toBe(false);
        expect(config.LOG_LEVEL).toBe("warn");
        expectTypeOf(config.PORT).toEqualTypeOf<number>();
        expectTypeOf(config.DATABASE_URL).toEqualTypeOf<URL>();
        expectTypeOf(config.ENABLE_CACHE).toEqualTypeOf<boolean>();
        expectTypeOf(config.LOG_LEVEL).toEqualTypeOf<"debug" | "info" | "warn" | "error">();
    });

    it("safeParse returns structured errors for invalid env schema values", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.PORT = "abc";
        env = (await import("../src")).env;

        const result = env.schema.safeParse(env.schema.object({
            PORT: env.schema.number({integer: true, min: 1}),
            DATABASE_URL: env.schema.url(),
        }));

        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error("Expected schema parsing to fail");
        }
        expect(result.errors).toEqual([
            expect.objectContaining({path: "$.PORT", code: "invalid_type"}),
            expect.objectContaining({path: "$.DATABASE_URL", code: "required"}),
        ]);
    });

    it("parse throws SchemaValidationError for invalid required env schema values", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.PORT = "0";
        const module = await import("../src");
        env = module.env;

        expect(() =>
            env.schema.parse(env.schema.object({
                PORT: env.schema.number({integer: true, min: 1}),
            }))
        ).toThrow(module.SchemaValidationError);
    });

    it("rejects env schema urls with unsupported protocols", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        const result = env.schema.safeParse(env.schema.object({
            DATABASE_URL: env.schema.url({protocols: ["https:"]}),
        }), {
            DATABASE_URL: "http://db.example.com",
        });

        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error("Expected schema parsing to fail");
        }
        expect(result.errors).toEqual([
            expect.objectContaining({path: "$.DATABASE_URL", code: "invalid_url"}),
        ]);
    });

    it("covers env schema url fallback and invalid type branches", async () => {
        mockExistsSync.mockReturnValue(false);
        const module = await import("../src");
        env = module.env;

        expect(
            module.envValidation.url({default: "https://fallback.example.com"})(undefined, [])
        ).toEqual({
            success: true,
            data: new URL("https://fallback.example.com"),
        });

        const result = module.envValidation.url()(123 as any, []);
        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error("Expected schema parsing to fail");
        }
        expect(result.errors).toEqual([
            expect.objectContaining({code: "invalid_type"}),
        ]);
    });

    it("covers env schema boolean and enum direct validator branches", async () => {
        mockExistsSync.mockReturnValue(false);
        const module = await import("../src");
        env = module.env;

        const requiredString = module.envValidation.string()(undefined, []);
        expect(requiredString.success).toBe(false);
        if (requiredString.success) {
            throw new Error("Expected string validation to fail");
        }
        expect(requiredString.errors).toEqual([
            expect.objectContaining({code: "required"}),
        ]);

        const invalidNumberType = module.envValidation.number()(123 as any, []);
        expect(invalidNumberType.success).toBe(false);
        if (invalidNumberType.success) {
            throw new Error("Expected number validation to fail");
        }
        expect(invalidNumberType.errors).toEqual([
            expect.objectContaining({code: "invalid_type"}),
        ]);

        const booleanResult = module.envValidation.boolean()(123 as any, []);
        expect(booleanResult.success).toBe(false);
        if (booleanResult.success) {
            throw new Error("Expected boolean validation to fail");
        }
        expect(booleanResult.errors).toEqual([
            expect.objectContaining({code: "invalid_type"}),
        ]);

        const enumResult = module.envValidation.enum(["debug", "info"] as const, {case_insensitive: true})("DEBUG", []);
        expect(enumResult).toEqual({
            success: true,
            data: "debug",
        });

        const invalidEnumType = module.envValidation.enum(["debug", "info"] as const)(123 as any, []);
        expect(invalidEnumType.success).toBe(false);
        if (invalidEnumType.success) {
            throw new Error("Expected enum validation to fail");
        }
        expect(invalidEnumType.errors).toEqual([
            expect.objectContaining({code: "invalid_type"}),
        ]);
    });

    it("parses csv env schema values for optional and defaulted lists", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.PUBLIC_ALLOWED_HOSTS = "example.com, api.example.com , admin.example.com";
        env = (await import("../src")).env;

        const config = env.schema.parse(env.schema.object({
            PUBLIC_ALLOWED_HOSTS: env.schema.csv({
                item: {min: 1},
            }),
            PUBLIC_TRUSTED_PROXIES: env.schema.csv({
                default: ["127.0.0.1"],
            }),
        }));

        expect(config.PUBLIC_ALLOWED_HOSTS).toEqual([
            "example.com",
            "api.example.com",
            "admin.example.com",
        ]);
        expect(config.PUBLIC_TRUSTED_PROXIES).toEqual(["127.0.0.1"]);
        expectTypeOf(config.PUBLIC_ALLOWED_HOSTS).toEqualTypeOf<string[] | undefined>();
        expectTypeOf(config.PUBLIC_TRUSTED_PROXIES).toEqualTypeOf<string[] | undefined>();
    });

    it("omits csv values when the env string is blank and no default exists", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.PUBLIC_ALLOWED_HOSTS = " ,  , ";
        env = (await import("../src")).env;

        const config = env.schema.parse(env.schema.object({
            PUBLIC_ALLOWED_HOSTS: env.schema.csv(),
        }));

        expect("PUBLIC_ALLOWED_HOSTS" in config).toBe(false);
    });

    it("uses the csv default when the env string is blank", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.PUBLIC_TRUSTED_PROXIES = " , ";
        env = (await import("../src")).env;

        const config = env.schema.parse(env.schema.object({
            PUBLIC_TRUSTED_PROXIES: env.schema.csv({
                default: ["127.0.0.1"],
            }),
        }));

        expect(config.PUBLIC_TRUSTED_PROXIES).toEqual(["127.0.0.1"]);
    });

    it("returns csv validation errors for invalid env input types", async () => {
        mockExistsSync.mockReturnValue(false);
        const module = await import("../src");

        const invalidType = module.envValidation.csv()(123 as any, []);
        expect(invalidType.success).toBe(false);
        if (invalidType.success) {
            throw new Error("Expected csv validation to fail");
        }
        expect(invalidType.errors).toEqual([
            expect.objectContaining({code: "invalid_type"}),
        ]);
    });

    it("returns csv validation errors for invalid item and list constraints", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        const maxResult = env.schema.safeParse(env.schema.object({
            PUBLIC_ALLOWED_HOSTS: env.schema.csv({max: 1}),
        }), {
            PUBLIC_ALLOWED_HOSTS: "a,b",
        });
        expect(maxResult.success).toBe(false);
        if (maxResult.success) {
            throw new Error("Expected csv max validation to fail");
        }
        expect(maxResult.errors).toEqual([
            expect.objectContaining({code: "too_big"}),
        ]);

        const itemResult = env.schema.safeParse(env.schema.object({
            PUBLIC_ALLOWED_HOSTS: env.schema.csv({
                item: {pattern: /^[a-z.]+$/},
            }),
        }), {
            PUBLIC_ALLOWED_HOSTS: "ok.example, BAD-HOST",
        });
        expect(itemResult.success).toBe(false);
        if (itemResult.success) {
            throw new Error("Expected csv item validation to fail");
        }
        expect(itemResult.errors).toEqual([
            expect.objectContaining({path: "$.PUBLIC_ALLOWED_HOSTS[1]", code: "invalid_string"}),
        ]);
    });

    it("rejects env schema objects with non-uppercase keys", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        expect(() =>
            env.schema.object({
                port: env.schema.number({integer: true, min: 1}),
            } as any)
        ).toThrow("Environment schema keys must be uppercase: 'port'");
    });

    it("maps env values directly into an app-facing config object", async () => {
        mockExistsSync.mockReturnValue(false);
        process.env.NODE_ENV = "production";
        process.env.PUBLIC_SERVER_PORT = "8080";
        process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
        env = (await import("../src")).env;

        const runtimeConfig = env.config.map({
            nodeEnv: env.config.field(
                "NODE_ENV",
                env.schema.enum(["development", "test", "production"] as const, {
                    default: "development",
                })
            ),
            serverPort: env.config.field(
                "PUBLIC_SERVER_PORT",
                env.schema.number({integer: true, min: 1, max: 65_535, default: 3000})
            ),
            secretEncryptionKey: env.config.field(
                "SECRET_ENCRYPTION_KEY",
                env.schema.string({trim: true, min: 1})
            ),
            secretEncryptionKeyBuffer: env.config.field(
                "SECRET_ENCRYPTION_KEY",
                env.schema.string({trim: true, min: 1}),
                (value) => Buffer.from(value, "base64")
            ),
        });

        expect(runtimeConfig.nodeEnv).toBe("production");
        expect(runtimeConfig.serverPort).toBe(8080);
        expect(runtimeConfig.secretEncryptionKeyBuffer).toBeInstanceOf(Buffer);
        expect(runtimeConfig.secretEncryptionKeyBuffer.length).toBe(32);
        expectTypeOf(runtimeConfig.nodeEnv).toEqualTypeOf<"development" | "test" | "production">();
        expectTypeOf(runtimeConfig.serverPort).toEqualTypeOf<number>();
        expectTypeOf(runtimeConfig.secretEncryptionKeyBuffer).toEqualTypeOf<Buffer>();
    });

    it("safeMap returns env validation errors for invalid mapped fields", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        const result = env.config.safeMap({
            serverPort: env.config.field(
                "PUBLIC_SERVER_PORT",
                env.schema.number({integer: true, min: 1})
            ),
        }, {
            PUBLIC_SERVER_PORT: "0",
        });

        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error("Expected mapped validation to fail");
        }
        expect(result.errors).toEqual([
            expect.objectContaining({path: "$.PUBLIC_SERVER_PORT", code: "too_small"}),
        ]);
    });

    it("map surfaces transform failures as schema validation errors", async () => {
        mockExistsSync.mockReturnValue(false);
        const module = await import("../src");
        env = module.env;

        expect(() =>
            env.config.map({
                secretEncryptionKeyBuffer: env.config.field(
                    "SECRET_ENCRYPTION_KEY",
                    env.schema.string({trim: true, min: 1}),
                    () => {
                        throw new Error("SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
                    }
                ),
            }, {
                SECRET_ENCRYPTION_KEY: "value",
            })
        ).toThrow(module.SchemaValidationError);
    });

    it("safeMap uses a fallback transform error message when none exists", async () => {
        mockExistsSync.mockReturnValue(false);
        env = (await import("../src")).env;

        const result = env.config.safeMap({
            secretEncryptionKeyBuffer: env.config.field(
                "SECRET_ENCRYPTION_KEY",
                env.schema.string({trim: true, min: 1}),
                () => {
                    throw null;
                }
            ),
        }, {
            SECRET_ENCRYPTION_KEY: "value",
        });

        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error("Expected mapped transform to fail");
        }
        expect(result.errors).toEqual([
            expect.objectContaining({
                path: "$.secretEncryptionKeyBuffer",
                code: "transform_error",
                message: "Failed to map 'secretEncryptionKeyBuffer'",
            }),
        ]);
    });
});

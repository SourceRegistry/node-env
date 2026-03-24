import {describe, expect, it} from "vitest";
import {
    fail,
    isFailure,
    ok,
    runValidation,
    SchemaValidationError,
    validation
} from "../src/schema.helper";

describe("schema helper", () => {
    it("exposes ok, fail, isFailure, and runValidation helpers", () => {
        const success = ok("value");
        const failure = fail("Broken", ["ROOT", 0], "bad");

        expect(success).toEqual({success: true, data: "value"});
        expect(failure).toEqual({
            success: false,
            errors: [{path: "$.ROOT[0]", message: "Broken", code: "bad"}],
        });
        expect(fail("Nested", ["A", "B"], "nested")).toEqual({
            success: false,
            errors: [{path: "$.A.B", message: "Nested", code: "nested"}],
        });
        expect(isFailure(success)).toBe(false);
        expect(isFailure(failure)).toBe(true);
        expect(runValidation(validation.literal("value"), "value")).toEqual(success);
    });

    it("validates strings across success and failure branches", () => {
        const validator = validation.string({
            trim: true,
            non_empty: true,
            min: 2,
            max: 5,
            pattern: /^[a-z]+$/,
        });

        expect(validation.parse(validator, " ab ")).toBe("ab");
        expect(validation.safeParse(validator, 123)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_type"})],
        }));
        expect(validation.safeParse(validator, " ")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "too_small"})],
        }));
        expect(validation.safeParse(validator, "a")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "too_small"})],
        }));
        expect(validation.safeParse(validator, "abcdef")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "too_big"})],
        }));
        expect(validation.safeParse(validator, "ab1")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_string"})],
        }));
    });

    it("validates numbers, booleans, literals, and enums", () => {
        expect(validation.parse(validation.number({min: 1, max: 10, integer: true}), 5)).toBe(5);
        expect(validation.safeParse(validation.number(), Number.NaN)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_type"})],
        }));
        expect(validation.safeParse(validation.number(), Number.POSITIVE_INFINITY)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_number"})],
        }));
        expect(validation.parse(validation.number({finite: false}), Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
        expect(validation.safeParse(validation.number({integer: true}), 1.5)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_number"})],
        }));
        expect(validation.safeParse(validation.number({min: 3}), 2)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "too_small"})],
        }));
        expect(validation.safeParse(validation.number({max: 3}), 4)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "too_big"})],
        }));

        expect(validation.parse(validation.boolean(), true)).toBe(true);
        expect(validation.safeParse(validation.boolean(), "true")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_type"})],
        }));

        expect(validation.parse(validation.literal(null), null)).toBeNull();
        expect(validation.safeParse(validation.literal("yes"), "no")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_literal"})],
        }));

        expect(validation.parse(validation.enum(["a", "b"] as const), "a")).toBe("a");
        expect(validation.safeParse(validation.enum(["a", "b"] as const), 1)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_type"})],
        }));
        expect(validation.safeParse(validation.enum(["a", "b"] as const), "c")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_enum"})],
        }));
    });

    it("validates optional, nullable, arrays, and objects", () => {
        expect(validation.parse(validation.optional(validation.string()), undefined)).toBeUndefined();
        expect(validation.parse(validation.optional(validation.string()), "value")).toBe("value");
        expect(validation.parse(validation.nullable(validation.string()), null)).toBeNull();
        expect(validation.parse(validation.nullable(validation.string()), "value")).toBe("value");

        expect(validation.safeParse(
            validation.array(validation.number({integer: true}), {min: 1, max: 2}),
            "bad"
        )).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_type"})],
        }));
        expect(validation.safeParse(
            validation.array(validation.number(), {min: 2}),
            [1]
        )).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "too_small"})],
        }));
        expect(validation.safeParse(
            validation.array(validation.number(), {max: 1}),
            [1, 2]
        )).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "too_big"})],
        }));
        expect(validation.safeParse(
            validation.array(validation.number({integer: true})),
            [1, 1.5]
        )).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({path: "$[1]", code: "invalid_number"})],
        }));
        expect(validation.parse(validation.array(validation.number()), [1, 2])).toEqual([1, 2]);

        expect(validation.safeParse(validation.object({A: validation.string()}), "bad")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_type"})],
        }));

        expect(validation.parse(
            validation.object({A: validation.string()}, {unknown_keys: "allow"}),
            {A: "ok", EXTRA: 1}
        )).toEqual({A: "ok", EXTRA: 1});

        expect(validation.parse(
            validation.object({A: validation.string()}, {unknown_keys: "strip"}),
            {A: "ok", EXTRA: 1}
        )).toEqual({A: "ok"});

        expect(validation.safeParse(
            validation.object({A: validation.string()}, {unknown_keys: "error"}),
            {A: "ok", EXTRA: 1}
        )).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({path: "$.EXTRA", code: "unknown_key"})],
        }));
    });

    it("validates union, refine, safeParse, and parse errors", () => {
        const unionValidator = validation.union(validation.literal("yes"), validation.number({min: 1}));
        expect(validation.parse(unionValidator, "yes")).toBe("yes");
        expect(validation.parse(unionValidator, 2)).toBe(2);
        expect(validation.safeParse(unionValidator, false)).toEqual(expect.objectContaining({
            success: false,
            errors: [
                expect.objectContaining({code: "invalid_literal"}),
                expect.objectContaining({code: "invalid_type"}),
            ],
        }));

        const refined = validation.refine(
            validation.string(),
            (value) => value.startsWith("x"),
            "Must start with x",
            "starts_with_x"
        );
        expect(validation.parse(refined, "xyz")).toBe("xyz");
        expect(validation.safeParse(refined, "abc")).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "starts_with_x"})],
        }));
        expect(validation.safeParse(refined, 123)).toEqual(expect.objectContaining({
            success: false,
            errors: [expect.objectContaining({code: "invalid_type"})],
        }));

        expect(() => validation.parse(validation.number(), "nope")).toThrow(SchemaValidationError);
    });
});

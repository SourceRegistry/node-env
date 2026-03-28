/**
 * A single validation issue produced by a validator.
 */
export type ValidationIssue = {
    path: string;
    message: string;
    code?: string;
};

/**
 * Successful validation result.
 */
export type ValidationSuccess<T> = {
    success: true;
    data: T;
};

/**
 * Failed validation result.
 */
export type ValidationFailure = {
    success: false;
    errors: ValidationIssue[];
};

/**
 * The result returned by all validators.
 */
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Internal path representation used while walking nested values.
 */
export type ValidationPath = Array<string | number>;

/**
 * Runtime validator function.
 */
export type Validator<T> = (value: unknown, path?: ValidationPath) => ValidationResult<T>;

/**
 * Infers the validated type from a validator.
 */
export type InferValidator<V> = V extends Validator<infer T> ? T : never;

/**
 * Generic object schema shape.
 */
export type SchemaShape = Record<string, Validator<any>>;

/**
 * Infers the validated output from an object schema shape.
 */
export type InferSchemaShape<S extends SchemaShape> = {
    [K in keyof S]: InferValidator<S[K]>;
};

/**
 * Issue input shape accepted by adapter helpers.
 */
export type ValidationIssueInput = {
    path?: string | ValidationPath;
    message: string;
    code?: string;
};

/**
 * Result shape accepted by adapter helpers.
 */
export type ValidationAdapterResult<T> =
    | ValidationResult<T>
    | {
        success: true;
        data: T;
    }
    | {
        success: false;
        errors?: ValidationIssueInput[];
        issues?: ValidationIssueInput[];
        error?: unknown;
    };

/**
 * Adapter used to bridge external schema libraries into the local validator contract.
 */
export type ValidationAdapter<TSchema, TOutput = unknown> = {
    safeParse(schema: TSchema, value: unknown): ValidationAdapterResult<TOutput>;
};

/**
 * Error thrown by `validation.parse()` when validation fails.
 */
export class SchemaValidationError extends Error {
    public readonly errors: ValidationIssue[];

    constructor(errors: ValidationIssue[], message: string = "Schema validation failed") {
        super(message);
        this.name = "SchemaValidationError";
        this.errors = errors;
    }
}

export const toPathString = (path: ValidationPath) => {
    if (path.length === 0) return "$";
    return path.reduce<string>((acc, part) => {
        if (typeof part === "number") return `${acc}[${part}]`;
        if (acc === "$") return `${acc}.${part}`;
        return `${acc}.${part}`;
    }, "$");
};

const normalizePath = (path: string | ValidationPath | undefined, fallback: ValidationPath): string => {
    if (typeof path === "string") {
        return path.startsWith("$") ? path : toPathString([...fallback, path]);
    }
    return toPathString(path ?? fallback);
};

const normalizeIssue = (issue: ValidationIssueInput, fallback: ValidationPath): ValidationIssue => ({
    path: normalizePath(issue.path, fallback),
    message: issue.message,
    code: issue.code,
});

/**
 * Creates a successful validation result.
 */
export const ok = <T>(data: T): ValidationSuccess<T> => ({
    success: true,
    data
});

/**
 * Creates a failed validation result for the given path.
 */
export const fail = (message: string, path: ValidationPath, code?: string): ValidationFailure => ({
    success: false,
    errors: [{path: toPathString(path), message, code}]
});

const mergeErrors = (...results: ValidationFailure[]): ValidationFailure => ({
    success: false,
    errors: results.flatMap((r) => r.errors)
});

/**
 * Returns `true` when a validation result represents a failure.
 */
export const isFailure = <T>(result: ValidationResult<T>): result is ValidationFailure =>
    !result.success;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Normalizes adapter output into the local validation result format.
 */
export const normalizeAdapterResult = <T>(
    result: ValidationAdapterResult<T>,
    path: ValidationPath = []
): ValidationResult<T> => {
    if (result.success) {
        return ok(result.data);
    }

    if ("errors" in result && Array.isArray(result.errors) && result.errors.length > 0) {
        return {
            success: false,
            errors: result.errors.map((issue) => normalizeIssue(issue, path)),
        };
    }

    if ("issues" in result && Array.isArray(result.issues) && result.issues.length > 0) {
        return {
            success: false,
            errors: result.issues.map((issue) => normalizeIssue(issue, path)),
        };
    }

    const error = "error" in result ? result.error : undefined;
    const message = error instanceof Error
        ? error.message
        : "Schema validation failed";
    return fail(message, path, "invalid_schema");
};

/**
 * Wraps an external schema and adapter into a local validator function.
 */
export const adaptSchema = <TSchema, T>(
    schema: TSchema,
    adapter: ValidationAdapter<TSchema, T>
): Validator<T> =>
    (value, path = []) => normalizeAdapterResult<T>(adapter.safeParse(schema, value), path);

/**
 * Runs a validator against a value.
 */
export const runValidation = <T>(validator: Validator<T>, value: unknown, path: ValidationPath = []): ValidationResult<T> =>
    validator(value, path);

/**
 * Generic validation primitives that work on plain runtime values.
 */
export const validation = {
    /**
     * Validates a string value.
     */
    string: (options?: {
        trim?: boolean;
        min?: number;
        max?: number;
        non_empty?: boolean;
        pattern?: RegExp;
    }): Validator<string> =>
        (value, path = []) => {
            if (typeof value !== "string") {
                return fail("Expected string", path, "invalid_type");
            }
            const next = options?.trim ? value.trim() : value;
            if (options?.non_empty && next.length === 0) {
                return fail("String cannot be empty", path, "too_small");
            }
            if (options?.min !== undefined && next.length < options.min) {
                return fail(`String must have length >= ${options.min}`, path, "too_small");
            }
            if (options?.max !== undefined && next.length > options.max) {
                return fail(`String must have length <= ${options.max}`, path, "too_big");
            }
            if (options?.pattern && !options.pattern.test(next)) {
                return fail("String does not match required pattern", path, "invalid_string");
            }
            return ok(next);
        },

    /**
     * Validates a number value.
     */
    number: (options?: {
        min?: number;
        max?: number;
        integer?: boolean;
        finite?: boolean;
    }): Validator<number> =>
        (value, path = []) => {
            if (typeof value !== "number" || Number.isNaN(value)) {
                return fail("Expected number", path, "invalid_type");
            }
            if (options?.finite !== false && !Number.isFinite(value)) {
                return fail("Expected finite number", path, "invalid_number");
            }
            if (options?.integer && !Number.isInteger(value)) {
                return fail("Expected integer", path, "invalid_number");
            }
            if (options?.min !== undefined && value < options.min) {
                return fail(`Number must be >= ${options.min}`, path, "too_small");
            }
            if (options?.max !== undefined && value > options.max) {
                return fail(`Number must be <= ${options.max}`, path, "too_big");
            }
            return ok(value);
        },

    /**
     * Validates a boolean value.
     */
    boolean: (): Validator<boolean> =>
        (value, path = []) =>
            typeof value === "boolean"
                ? ok(value)
                : fail("Expected boolean", path, "invalid_type"),

    /**
     * Validates a literal value.
     */
    literal: <T extends string | number | boolean | null>(expected: T): Validator<T> =>
        (value, path = []) =>
            value === expected
                ? ok(expected)
                : fail(`Expected literal '${String(expected)}'`, path, "invalid_literal"),

    /**
     * Validates one of the provided string literal values.
     */
    enum: <const T extends readonly string[]>(values: T): Validator<T[number]> =>
        (value, path = []) => {
            if (typeof value !== "string") {
                return fail("Expected string enum value", path, "invalid_type");
            }
            return (values as readonly string[]).includes(value)
                ? ok(value as T[number])
                : fail(`Expected one of: ${values.join(", ")}`, path, "invalid_enum");
        },

    /**
     * Makes another validator optional.
     */
    optional: <T>(inner: Validator<T>): Validator<T | undefined> =>
        (value, path = []) =>
            value === undefined ? ok(undefined) : runValidation(inner, value, path),

    /**
     * Makes another validator nullable.
     */
    nullable: <T>(inner: Validator<T>): Validator<T | null> =>
        (value, path = []) =>
            value === null ? ok(null) : runValidation(inner, value, path),

    /**
     * Validates an array and each of its items.
     */
    array: <T>(
        inner: Validator<T>,
        options?: {
            min?: number;
            max?: number;
        }
    ): Validator<T[]> =>
        (value, path = []) => {
            if (!Array.isArray(value)) {
                return fail("Expected array", path, "invalid_type");
            }
            if (options?.min !== undefined && value.length < options.min) {
                return fail(`Array length must be >= ${options.min}`, path, "too_small");
            }
            if (options?.max !== undefined && value.length > options.max) {
                return fail(`Array length must be <= ${options.max}`, path, "too_big");
            }
            const out: T[] = [];
            const errors: ValidationFailure[] = [];
            for (let i = 0; i < value.length; i++) {
                const result = runValidation(inner, value[i], [...path, i]);
                if (isFailure(result)) errors.push(result);
                else out.push(result.data);
            }
            return errors.length > 0 ? mergeErrors(...errors) : ok(out);
        },

    /**
     * Validates an object against a schema shape.
     */
    object: <S extends SchemaShape>(
        schema: S,
        options?: {
            unknown_keys?: "strip" | "allow" | "error";
        }
    ): Validator<InferSchemaShape<S> & Record<string, unknown>> =>
        (value, path = []) => {
            if (!isPlainObject(value)) {
                return fail("Expected object", path, "invalid_type");
            }

            const unknownKeys = options?.unknown_keys ?? "strip";
            const errors: ValidationFailure[] = [];
            const output: Record<string, unknown> = {};

            for (const [key, validator] of Object.entries(schema)) {
                const result = runValidation(validator, value[key], [...path, key]);
                if (isFailure(result)) {
                    errors.push(result);
                } else if (result.data !== undefined) {
                    output[key] = result.data;
                }
            }

            for (const key of Object.keys(value)) {
                if (key in schema) continue;
                if (unknownKeys === "allow") output[key] = value[key];
                if (unknownKeys === "error") {
                    errors.push(fail(`Unknown key '${key}'`, [...path, key], "unknown_key"));
                }
            }

            return errors.length > 0 ? mergeErrors(...errors) : ok(output as InferSchemaShape<S> & Record<string, unknown>);
        },

    /**
     * Validates a value against either of two validators.
     */
    union: <A, B>(a: Validator<A>, b: Validator<B>): Validator<A | B> =>
        (value, path = []) => {
            const left = runValidation(a, value, path);
            if (!isFailure(left)) return left;
            const right = runValidation(b, value, path);
            if (!isFailure(right)) return right;
            return mergeErrors(left, right);
        },

    /**
     * Adds a custom predicate to an existing validator.
     */
    refine: <T>(
        base: Validator<T>,
        predicate: (value: T) => boolean,
        message: string,
        code: string = "custom"
    ): Validator<T> =>
        (value, path = []) => {
            const result = runValidation(base, value, path);
            if (isFailure(result)) return result;
            if (!predicate(result.data)) return fail(message, path, code);
            return result;
        },

    /**
     * Runs a validator and returns a result object instead of throwing.
     */
    safeParse: <T>(validator: Validator<T>, value: unknown): ValidationResult<T> =>
        runValidation(validator, value, []),

    /**
     * Runs a validator and throws `SchemaValidationError` on failure.
     */
    parse: <T>(validator: Validator<T>, value: unknown): T => {
        const result = runValidation(validator, value, []);
        if (isFailure(result)) {
            throw new SchemaValidationError(result.errors);
        }
        return result.data;
    }
};

export default validation;

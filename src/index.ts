import {readFileSync, existsSync} from "fs";
import {
    adaptSchema,
    fail,
    InferValidator,
    InferSchemaShape,
    isFailure,
    ok,
    runValidation,
    SchemaShape,
    SchemaValidationError,
    validation,
    ValidationIssue,
    ValidationPath,
    ValidationFailure,
    ValidationResult,
    ValidationSuccess,
    ValidationAdapter,
    ValidationAdapterResult,
    ValidationIssueInput,
    Validator
} from "./validation";

type DotEnvEntries = Record<string, string>;
const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

function createStore(): DotEnvEntries {
    return Object.create(null) as DotEnvEntries;
}

function assertKey(key: string): asserts key is Uppercase<string> {
    if (typeof key !== "string" || key.trim() === "") {
        throw new TypeError("Environment key must be a non-empty string");
    }
    if (key !== key.toUpperCase() || !ENV_KEY_PATTERN.test(key)) {
        throw new TypeError("Environment key must be uppercase and contain only letters, numbers, and underscores");
    }
}

function assertFiniteNumber(value: number, label: string): void {
    if (!Number.isFinite(value)) {
        throw new TypeError(`${label} must be a finite number`);
    }
}

function assertEnumValues(values: readonly string[]): void {
    if (values.length === 0) {
        throw new TypeError("Enum values must contain at least one item");
    }
    if (values.some((value) => typeof value !== "string" || value.length === 0)) {
        throw new TypeError("Enum values must be non-empty strings");
    }
}

function parseUrl(raw: string): URL | null {
    try {
        return new URL(raw);
    } catch {
        return null;
    }
}

function parseQuotedValue(value: string, quote: "'" | "\""): string {
    const inner = value.slice(1, -1);
    if (quote === "'") {
        return inner;
    }
    return inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\");
}

function stripInlineComment(value: string): string {
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        const previous = i > 0 ? value[i - 1] : "";

        if (char === "'" && !inDouble && previous !== "\\") {
            inSingle = !inSingle;
            continue;
        }
        if (char === "\"" && !inSingle && previous !== "\\") {
            inDouble = !inDouble;
            continue;
        }
        if (char === "#" && !inSingle && !inDouble) {
            const before = i === 0 ? "" : value[i - 1];
            if (i === 0 || /\s/.test(before)) {
                return value.slice(0, i).trimEnd();
            }
        }
    }

    return value.trim();
}

function normalizeEnvBoolean(value: string): boolean | undefined {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    return undefined;
}

function serializeBoolean(value: boolean): string {
    return value ? "true" : "false";
}

function normalizeCsvEntries(
    value: string,
    separator: string | RegExp = ","
): string[] | undefined {
    const entries = value
        .split(separator)
        .map((entry) => entry.trim())
        .filter(Boolean);

    return entries.length > 0 ? entries : undefined;
}

function missingEnvValue<T>(fallback: T | undefined, path: Array<string | number>): ValidationResult<T> {
    return fallback === undefined
        ? fail("Required environment variable is missing", path, "required")
        : ok(fallback);
}

function resolveEnvValue<T>(
    key: Uppercase<string>,
    validator: Validator<T>,
    fallback: T,
    serialize: (value: T) => string
): T {
    const result = runValidation(validator, process.env[key], [key]);
    if (isFailure(result)) {
        process.env[key] = serialize(fallback);
        return fallback;
    }
    process.env[key] = serialize(result.data);
    return result.data;
}

/**
 * Shape used by env object schemas.
 */
export type EnvSchemaShape = Record<string, Validator<any>>;
/**
 * Inferred output from an env object schema.
 */
export type EnvSchemaResult<S extends EnvSchemaShape> = InferSchemaShape<S> & Record<string, unknown>;
/**
 * Runtime validator type produced by `env.schema.object(...)`.
 */
export type EnvObjectSchema<S extends EnvSchemaShape> = Validator<EnvSchemaResult<S>> & {
    readonly __shape?: S;
};
/**
 * Source object used while parsing or mapping environment values.
 */
export type EnvSource = Record<string, string | undefined>;
/**
 * Config field definition used by `env.config.field(...)`.
 */
export type EnvMappedField<TValue, TOutput = TValue> = {
    readonly key: Uppercase<string>;
    readonly validator: Validator<TValue>;
    readonly transform?: (value: TValue, source: EnvSource) => TOutput;
};
/**
 * Shape used by `env.config.map(...)`.
 */
export type EnvMappedShape = Record<string, EnvMappedField<any, any>>;
/**
 * Inferred output type from an env mapped field.
 */
export type InferMappedField<TField> = TField extends EnvMappedField<any, infer TOutput> ? TOutput : never;
/**
 * Inferred output type from an env mapped shape.
 */
export type InferMappedShape<TShape extends EnvMappedShape> = {
    [K in keyof TShape]: InferMappedField<TShape[K]>;
};

type EnvValidationApi = {
    string: (options?: {
        trim?: boolean;
        min?: number;
        max?: number;
        non_empty?: boolean;
        pattern?: RegExp;
        default?: string;
    }) => Validator<string>;
    number: (options?: {
        min?: number;
        max?: number;
        integer?: boolean;
        finite?: boolean;
        default?: number;
    }) => Validator<number>;
    boolean: (options?: {
        default?: boolean;
    }) => Validator<boolean>;
    enum: <const T extends readonly [string, ...string[]]>(
        values: T,
        options?: {
            default?: T[number];
            case_insensitive?: boolean;
        }
    ) => Validator<T[number]>;
    url: (options?: {
        default?: string | URL;
        protocols?: string[];
    }) => Validator<URL>;
    csv: (options?: {
        separator?: string | RegExp;
        min?: number;
        max?: number;
        default?: string[];
        item?: {
            min?: number;
            max?: number;
            pattern?: RegExp;
        };
    }) => Validator<string[] | undefined>;
    optional: typeof validation.optional;
    nullable: typeof validation.nullable;
    array: typeof validation.array;
    union: typeof validation.union;
    literal: typeof validation.literal;
    refine: typeof validation.refine;
    object: typeof defineEnvSchema;
    safeParse: <S extends EnvSchemaShape>(
        schema: EnvObjectSchema<S>,
        value?: EnvSource
    ) => ValidationResult<EnvSchemaResult<S>>;
    parse: <S extends EnvSchemaShape>(
        schema: EnvObjectSchema<S>,
        value?: EnvSource
    ) => EnvSchemaResult<S>;
};

type EnvConfigApi = {
    field: typeof defineEnvField;
    safeMap: <TShape extends EnvMappedShape>(
        shape: TShape,
        value?: EnvSource
    ) => ValidationResult<InferMappedShape<TShape>>;
    map: <TShape extends EnvMappedShape>(
        shape: TShape,
        value?: EnvSource
    ) => InferMappedShape<TShape>;
};

type EnvApi = {
    string: <T extends string = string>(key: Uppercase<string>, _default?: T) => T;
    enum: <const T extends readonly [string, ...string[]]>(
        key: Uppercase<string>,
        values: T,
        _default?: T[number]
    ) => T[number];
    number: (key: Uppercase<string>, _default?: number) => number;
    boolean: (key: Uppercase<string>, _default?: boolean) => boolean;
    url: (key: Uppercase<string>, _default?: URL) => URL;
    has: (key: Uppercase<string>) => boolean;
    assert: (
        keys: Uppercase<string>[],
        error_builder?: (missing_keys: string[]) => string | Error
    ) => void;
    defined: (key: Uppercase<string>) => boolean;
    readonly dev: boolean;
    collection: <PF extends Uppercase<string>, RemovePrefix extends boolean = false>(
        prefix: PF,
        options?: Partial<{
            reviver: (value: string | undefined, key: string) => any;
            removePrefix: RemovePrefix;
        }>
    ) => Record<string, any>;
    utils: {
        select: <T, F>(
            key: Uppercase<string>,
            TRUE: T,
            FALSE: F,
            predicate?: (key: Uppercase<string>, value: any) => boolean
        ) => T | F;
    };
    schema: EnvValidationApi;
    config: EnvConfigApi;
    readonly raw: Readonly<DotEnvEntries>;
};

function assertEnvSchemaShape(shape: EnvSchemaShape): void {
    for (const key of Object.keys(shape)) {
        if (key !== key.toUpperCase()) {
            throw new TypeError(`Environment schema keys must be uppercase: '${key}'`);
        }
        assertKey(key);
    }
}

function defineEnvSchema<S extends EnvSchemaShape>(
    shape: S,
    options?: {
        unknown_keys?: "strip" | "allow" | "error";
    }
): EnvObjectSchema<S> {
    assertEnvSchemaShape(shape);
    return validation.object(shape as SchemaShape, options) as EnvObjectSchema<S>;
}

function defineEnvField<TKey extends Uppercase<string>, TValue>(
    key: TKey,
    validator: Validator<TValue>
): EnvMappedField<TValue, TValue>;
function defineEnvField<TKey extends Uppercase<string>, TValue, TOutput>(
    key: TKey,
    validator: Validator<TValue>,
    transform: (value: TValue, source: EnvSource) => TOutput
): EnvMappedField<TValue, TOutput>;
function defineEnvField<TKey extends Uppercase<string>, TValue, TOutput>(
    key: TKey,
    validator: Validator<TValue>,
    transform?: (value: TValue, source: EnvSource) => TOutput
): EnvMappedField<TValue, TOutput | TValue> {
    assertKey(key);
    return {
        key,
        validator,
        transform,
    };
}

function mapEnvShape<TShape extends EnvMappedShape>(
    shape: TShape,
    source: EnvSource = process.env
): ValidationResult<InferMappedShape<TShape>> {
    const output: Partial<InferMappedShape<TShape>> = {};
    const errors: ValidationFailure[] = [];

    for (const [localKey, field] of Object.entries(shape) as Array<[keyof TShape, TShape[keyof TShape]]>) {
        const result = runValidation(field.validator, source[field.key], [field.key]);
        if (isFailure(result)) {
            errors.push(result);
            continue;
        }

        try {
            output[localKey] = field.transform
                ? field.transform(result.data, source)
                : result.data;
        } catch (error: any) {
            errors.push(fail(
                error?.message ?? `Failed to map '${String(localKey)}'`,
                [String(localKey)],
                "transform_error"
            ));
        }
    }

    if (errors.length > 0) {
        return {
            success: false,
            errors: errors.flatMap((error) => error.errors),
        };
    }

    return ok(output as InferMappedShape<TShape>);
}

/**
 * Env-aware validation helpers for parsing `process.env` string values.
 */
const envValidation: EnvValidationApi = Object.freeze({
    /**
     * Reads a string environment variable.
     */
    string: (options?: {
        trim?: boolean;
        min?: number;
        max?: number;
        non_empty?: boolean;
        pattern?: RegExp;
        default?: string;
    }): Validator<string> =>
        (value, path = []) => {
            if (value === undefined) {
                return missingEnvValue(options?.default, path);
            }
            return runValidation(validation.string(options), value, path);
        },

    /**
     * Reads a number environment variable.
     */
    number: (options?: {
        min?: number;
        max?: number;
        integer?: boolean;
        finite?: boolean;
        default?: number;
    }): Validator<number> =>
        (value, path = []) => {
            if (value === undefined) {
                return missingEnvValue(options?.default, path);
            }
            if (typeof value !== "string") {
                return fail("Expected environment variable to be a string", path, "invalid_type");
            }
            return runValidation(validation.number(options), Number(value.trim()), path);
        },

    /**
     * Reads a boolean environment variable.
     */
    boolean: (options?: {
        default?: boolean;
    }): Validator<boolean> =>
        (value, path = []) => {
            if (value === undefined) {
                return missingEnvValue(options?.default, path);
            }
            if (typeof value !== "string") {
                return fail("Expected environment variable to be a string", path, "invalid_type");
            }
            const normalized = normalizeEnvBoolean(value);
            if (normalized === undefined) {
                return fail("Expected a boolean-like environment value", path, "invalid_boolean");
            }
            return ok(normalized);
        },

    /**
     * Reads a string enum environment variable.
     */
    enum: <const T extends readonly [string, ...string[]]>(
        values: T,
        options?: {
            default?: T[number];
            case_insensitive?: boolean;
        }
    ): Validator<T[number]> =>
        (value, path = []) => {
            if (value === undefined) {
                return missingEnvValue(options?.default, path);
            }
            if (typeof value !== "string") {
                return fail("Expected environment variable to be a string", path, "invalid_type");
            }
            const normalized = options?.case_insensitive
                ? values.find((candidate) => candidate.toLowerCase() === value.toLowerCase())
                : value;
            return runValidation(validation.enum(values), normalized, path);
        },

    /**
     * Reads a URL environment variable.
     */
    url: (options?: {
        default?: string | URL;
        protocols?: string[];
    }): Validator<URL> =>
        (value, path = []) => {
            const fallback = options?.default instanceof URL
                ? options.default.toString()
                : options?.default;
            if (value === undefined) {
                if (fallback === undefined) {
                    return fail("Required environment variable is missing", path, "required");
                }
                value = fallback;
            }
            if (typeof value !== "string") {
                return fail("Expected environment variable to be a string", path, "invalid_type");
            }
            try {
                const url = new URL(value);
                if (options?.protocols && !options.protocols.includes(url.protocol)) {
                    return fail(`Expected URL protocol to be one of: ${options.protocols.join(", ")}`, path, "invalid_url");
                }
                return ok(url);
            } catch {
                return fail("Expected a valid URL", path, "invalid_url");
            }
        },

    /**
     * Reads a comma-separated string environment variable as `string[]`.
     */
    csv: (options?: {
        separator?: string | RegExp;
        min?: number;
        max?: number;
        default?: string[];
        item?: {
            min?: number;
            max?: number;
            pattern?: RegExp;
        };
    }): Validator<string[] | undefined> =>
        (value, path = []) => {
            if (value === undefined) {
                return ok(options?.default);
            }
            if (typeof value !== "string") {
                return fail("Expected environment variable to be a string", path, "invalid_type");
            }

            const entries = normalizeCsvEntries(value, options?.separator);
            if (entries === undefined) {
                return ok(options?.default);
            }

            const itemValidator = validation.string({
                min: options?.item?.min,
                max: options?.item?.max,
                pattern: options?.item?.pattern,
                non_empty: true,
                trim: true,
            });

            return runValidation(
                validation.array(itemValidator, {
                    min: options?.min,
                    max: options?.max,
                }),
                entries,
                path
            );
        },

    /** Re-export of the generic optional validator helper. */
    optional: validation.optional,
    /** Re-export of the generic nullable validator helper. */
    nullable: validation.nullable,
    /** Re-export of the generic array validator helper. */
    array: validation.array,
    /** Re-export of the generic union validator helper. */
    union: validation.union,
    /** Re-export of the generic literal validator helper. */
    literal: validation.literal,
    /** Re-export of the generic refine validator helper. */
    refine: validation.refine,
    /**
     * Builds an env object schema where keys must be uppercase env variable names.
     */
    object: defineEnvSchema,
    /**
     * Parses an env schema and returns a result object instead of throwing.
     */
    safeParse: <S extends EnvSchemaShape>(
        schema: EnvObjectSchema<S>,
        value: EnvSource = process.env
    ): ValidationResult<EnvSchemaResult<S>> =>
        runValidation(schema, value, []),
    /**
     * Parses an env schema and throws `SchemaValidationError` on failure.
     */
    parse: <S extends EnvSchemaShape>(
        schema: EnvObjectSchema<S>,
        value: EnvSource = process.env
    ): EnvSchemaResult<S> => {
        const result = runValidation(schema, value, []);
        if (isFailure(result)) {
            throw new SchemaValidationError(result.errors, "Environment validation failed");
        }
        return result.data;
    },
});

/**
 * Config-mapping helpers for building final application config objects from env values.
 */
const envConfig: EnvConfigApi = Object.freeze({
    /**
     * Declares a single config field backed by an environment variable.
     */
    field: defineEnvField,
    /**
     * Maps env-backed fields into a final config object and returns a result object.
     */
    safeMap: <TShape extends EnvMappedShape>(
        shape: TShape,
        value: EnvSource = process.env
    ): ValidationResult<InferMappedShape<TShape>> =>
        mapEnvShape(shape, value),
    /**
     * Maps env-backed fields into a final config object and throws on failure.
     */
    map: <TShape extends EnvMappedShape>(
        shape: TShape,
        value: EnvSource = process.env
    ): InferMappedShape<TShape> => {
        const result = mapEnvShape(shape, value);
        if (isFailure(result)) {
            throw new SchemaValidationError(result.errors, "Environment validation failed");
        }
        return result.data;
    },
});

function loadDotEnv(file = ".env"): DotEnvEntries {
    if (!existsSync(file)) return createStore();

    try {
        const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
        const parsed = createStore();

        for (const rawLine of text.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;

            const normalizedLine = line.startsWith("export ") ? line.slice(7).trimStart() : line;
            const separatorIndex = normalizedLine.indexOf("=");
            if (separatorIndex <= 0) continue;

            const key = normalizedLine.slice(0, separatorIndex).trim();
            if (!key || !ENV_KEY_PATTERN.test(key)) continue;

            let value = stripInlineComment(normalizedLine.slice(separatorIndex + 1).trim());
            if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
                value = parseQuotedValue(value, "\"");
            } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
                value = parseQuotedValue(value, "'");
            }

            parsed[key] = value;
        }

        return parsed;
    } catch (e: any) {
        const msg = e?.message ?? "Failed to load .env";
        // @ts-ignore
        if (globalThis.logger?.warn) globalThis.logger.warn(msg);
        else console.warn(msg);
        return createStore();
    }
}

// merge .env into process.env at load
const dotEnvVars: DotEnvEntries = loadDotEnv();
for (const [k, v] of Object.entries(dotEnvVars)) {
    if (!(k in process.env)) process.env[k] = v;
}

/**
 * Main runtime API for loading, reading, validating, and mapping environment variables.
 */
export const env: EnvApi = Object.freeze({
    /**
     * Reads an environment variable as a string.
     */
    string<T extends string = string>(key: Uppercase<string>, _default?: T): T {
        assertKey(key);
        return resolveEnvValue(
            key,
            envValidation.string({default: _default ?? ""}) as Validator<T>,
            (_default ?? "") as T,
            (value) => value
        );
    },
    /**
     * Reads an environment variable as a string enum.
     */
    enum<const T extends readonly [string, ...string[]]>(
        key: Uppercase<string>,
        values: T,
        _default: T[number] = values[0]
    ): T[number] {
        assertKey(key);
        assertEnumValues(values);
        if (!values.includes(_default)) {
            throw new TypeError("Enum default must be one of the allowed values");
        }
        return resolveEnvValue(
            key,
            envValidation.enum(values, {default: _default}),
            _default,
            (value) => value
        );
    },
    /**
     * Reads an environment variable as a number.
     */
    number(key: Uppercase<string>, _default = 0): number {
        assertKey(key);
        assertFiniteNumber(_default, "Number default");
        return resolveEnvValue(
            key,
            envValidation.number({default: _default}),
            _default,
            (value) => String(value)
        );
    },
    /**
     * Reads an environment variable as a boolean.
     */
    boolean(key: Uppercase<string>, _default = false): boolean {
        assertKey(key);
        return resolveEnvValue(
            key,
            envValidation.boolean({default: _default}),
            _default,
            serializeBoolean
        );
    },
    /**
     * Reads an environment variable as a `URL`.
     */
    url(key: Uppercase<string>, _default = new URL("http://localhost")): URL {
        assertKey(key);
        const fallback = parseUrl(_default.toString());
        if (!fallback) {
            throw new TypeError("URL default must be a valid URL");
        }
        return resolveEnvValue(
            key,
            envValidation.url({default: fallback}),
            fallback,
            (value) => value.toString()
        );
    },
    /**
     * Returns `true` if an environment variable exists.
     */
    has(key: Uppercase<string>): boolean {
        assertKey(key);
        return Object.prototype.hasOwnProperty.call(process.env, key);
    },
    /**
     * Throws if one or more required environment variables are missing.
     */
    assert(keys: Uppercase<string>[], error_builder: (missing_keys: string[]) => string | Error = ((missing_keys) => new Error(`Missing required keys(${missing_keys.join()}) in environment`)),) {
        const missing_keys: string[] = [];
        keys.forEach((key) => env.has(key) ? void 0 : missing_keys.push(key));
        if (missing_keys.length > 0) {
            const result = error_builder(missing_keys);
            if (typeof result === "string") throw new Error(result);
            else throw result;
        }
    },
    /**
     * Returns `true` if an environment variable exists and is defined.
     */
    defined(key: Uppercase<string>): boolean {
        assertKey(key);
        return env.has(key) && process.env[key] !== undefined;
    },

    /**
     * Convenience flag for checking whether `NODE_ENV` is not `"production"`.
     */
    get dev(): boolean {
        return process.env.NODE_ENV !== "production";
    },

    /**
     * Collects environment variables by prefix into an object.
     */
    collection<PF extends Uppercase<string>, RemovePrefix extends boolean = false>(
        prefix: PF,
        options: Partial<{
            reviver: (value: string | undefined, key: string) => any;
            removePrefix: RemovePrefix;
        }> = {}
    ): Record<string, any> {
        assertKey(prefix);
        const {reviver = (v) => v, removePrefix = false} = options;
        return Object.fromEntries(
            (Object.entries(process.env) as Array<[string, string | undefined]>)
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, value]) => [
                    removePrefix ? key.slice(prefix.length) : key,
                    reviver(value, key),
                ])
        );
    },

    utils: Object.freeze({
        select<T, F>(
            key: Uppercase<string>,
            TRUE: T,
            FALSE: F,
            predicate: (key: Uppercase<string>, value: any) => boolean = (k) =>
                env.boolean(k)
        ): T | F {
            assertKey(key);
            return predicate(key, process.env[key]) ? TRUE : FALSE;
        },
    }),
    /**
     * Env-aware validation helpers for parsing `process.env`.
     */
    schema: envValidation,
    /**
     * Higher-level config mapping helpers built on top of `env.schema`.
     */
    config: envConfig,
    /**
     * Raw values loaded from the `.env` file.
     */
    get raw(): Readonly<DotEnvEntries> {
        return Object.freeze({...dotEnvVars});
    },
});

/**
 * Re-export of the generic validation primitives and supporting public types.
 */
export {
    adaptSchema,
    envConfig,
    envValidation,
    fail,
    isFailure,
    ok,
    runValidation,
    SchemaValidationError,
    validation,
};
export type {
    InferValidator,
    InferSchemaShape,
    SchemaShape,
    ValidationAdapter,
    ValidationAdapterResult,
    ValidationFailure,
    ValidationIssue,
    ValidationIssueInput,
    ValidationPath,
    ValidationResult,
    ValidationSuccess,
    Validator,
};

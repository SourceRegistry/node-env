import {readFileSync, existsSync} from "fs";

type DotEnvEntries = Record<string, string>;

function createStore(): DotEnvEntries {
    return Object.create(null) as DotEnvEntries;
}

function assertKey(key: string): asserts key is Uppercase<string> {
    if (typeof key !== "string" || key.trim() === "") {
        throw new TypeError("Environment key must be a non-empty string");
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

function loadDotEnv(file = ".env") {
    if (!existsSync(file)) return {};

    try {
        const text = readFileSync(file, "utf8");
        const parsed = createStore();

        for (const rawLine of text.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;

            const normalizedLine = line.startsWith("export ") ? line.slice(7).trimStart() : line;
            const separatorIndex = normalizedLine.indexOf("=");
            if (separatorIndex <= 0) continue;

            const key = normalizedLine.slice(0, separatorIndex).trim();
            if (!key) continue;

            let value = normalizedLine.slice(separatorIndex + 1).trim();
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
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
const dotEnvVars = loadDotEnv();
for (const [k, v] of Object.entries(dotEnvVars)) {
    if (!(k in process.env)) process.env[k] = v;
}

export const env = Object.freeze({
    string<T extends string = string>(key: Uppercase<string>, _default?: T): T {
        assertKey(key);
        if (!(key in process.env)) process.env[key] = _default ?? "";
        return process.env[key] as T;
    },
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
        const raw = process.env[key];
        if (raw !== undefined && values.includes(raw)) return raw as T[number];
        process.env[key] = _default;
        return _default;
    },
    number(key: Uppercase<string>, _default = 0): number {
        assertKey(key);
        assertFiniteNumber(_default, "Number default");
        const raw = process.env[key];
        if (raw === undefined) {
            process.env[key] = String(_default);
            return _default;
        }
        const val = Number(raw);
        if (Number.isFinite(val)) return val;
        process.env[key] = String(_default);
        return _default;
    },
    boolean(key: Uppercase<string>, _default = false): boolean {
        assertKey(key);
        const raw = process.env[key];
        if (raw === undefined) {
            process.env[key] = _default ? "true" : "false";
            return _default;
        }
        const val = raw.trim().toLowerCase();
        return val === "true" || val === "1";
    },
    url(key: Uppercase<string>, _default = new URL("http://localhost")): URL {
        assertKey(key);
        const fallback = parseUrl(_default.toString());
        if (!fallback) {
            throw new TypeError("URL default must be a valid URL");
        }
        const raw = process.env[key];
        const parsed = raw === undefined ? null : parseUrl(raw);
        if (!parsed) {
            process.env[key] = fallback.toString();
            return fallback;
        }
        return parsed;
    },
    has(key: Uppercase<string>): boolean {
        assertKey(key);
        return Object.prototype.hasOwnProperty.call(process.env, key);
    },
    assert(keys: Uppercase<string>[], error_builder: (missing_keys: string[]) => string | Error = ((missing_keys) => new Error(`Missing required keys(${missing_keys.join()}) in environment`)),) {
        const missing_keys: string[] = [];
        keys.forEach((key) => env.has(key) ? void 0 : missing_keys.push(key));
        if (missing_keys.length > 0) {
            const result = error_builder(missing_keys);
            if (typeof result === "string") throw new Error(result);
            else throw result;
        }
    },
    defined(key: Uppercase<string>): boolean {
        assertKey(key);
        return env.has(key) && process.env[key] !== undefined;
    },

    get dev(): boolean {
        return process.env.NODE_ENV !== "production";
    },

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
            Object.entries(process.env)
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
    get raw() {
        return Object.freeze({...dotEnvVars})
    },
});

import { readFileSync, existsSync } from "fs";

function loadDotEnv(file = ".env") {
    if (!existsSync(file)) return {};

    try {
        const text = readFileSync(file, "utf8");
        return Object.fromEntries(
            text
                .split(/\r?\n/)
                .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
                .map((line) => {
                    const [key, ...rest] = line.split("=");
                    let value = rest.join("=").trim();
                    if (
                        (value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))
                    ) {
                        value = value.slice(1, -1);
                    }
                    return [key.trim(), value];
                })
        );
    } catch (e: any) {
        const msg = e?.message ?? "Failed to load .env";
        // @ts-ignore
        if (globalThis.logger?.warn) globalThis.logger.warn(msg);
        else console.warn(msg);
        return {};
    }
}

// merge .env into process.env at load
const dotEnvVars = loadDotEnv();
for (const [k, v] of Object.entries(dotEnvVars)) {
    if (!(k in process.env)) process.env[k] = v;
}

export const env = Object.freeze({
    string<T extends string = string>(key: Uppercase<string>, _default?: T): T {
        if (!(key in process.env)) process.env[key] = _default ?? "";
        return process.env[key] as T;
    },

    number(key: Uppercase<string>, _default = 0): number {
        const raw = process.env[key];
        if (raw === undefined) {
            process.env[key] = String(_default);
            return _default;
        }
        const val = Number(raw);
        return Number.isFinite(val) ? val : _default;
    },

    boolean(key: Uppercase<string>, _default = false): boolean {
        const raw = process.env[key];
        if (raw === undefined) {
            process.env[key] = _default ? "true" : "false";
            return _default;
        }
        const val = raw.toLowerCase();
        return val === "true" || val === "1";
    },

    has(key: Uppercase<string>): boolean {
        return Object.prototype.hasOwnProperty.call(process.env, key);
    },

    defined(key: Uppercase<string>): boolean {
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
        const { reviver = (v) => v, removePrefix = false } = options;
        return Object.fromEntries(
            Object.entries(process.env)
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, value]) => [
                    removePrefix ? key.replace(prefix, "") : key,
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
            return predicate(key, process.env[key]) ? TRUE : FALSE;
        },
    }),
    get raw(){
        return Object.freeze(dotEnvVars)
    }
});

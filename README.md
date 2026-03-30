# @sourceregistry/node-env
[![npm version](https://img.shields.io/npm/v/@sourceregistry/node-env?logo=npm)](https://www.npmjs.com/package/@sourceregistry/node-env)
[![JSR](https://jsr.io/badges/@sourceregistry/node-env)](https://jsr.io/@sourceregistry/node-env)
[![License](https://img.shields.io/npm/l/@sourceregistry/node-env)](https://github.com/SourceRegistry/node-env/blob/main/LICENSE)
[![CI](https://github.com/SourceRegistry/node-env/actions/workflows/ci.yml/badge.svg)](https://github.com/SourceRegistry/node-env/actions/workflows/ci.yml)
[![Codecov](https://img.shields.io/codecov/c/github/SourceRegistry/node-env)](https://codecov.io/gh/SourceRegistry/node-env)

## What is it?

`env` is a dependency-free TypeScript and JavaScript library for loading `.env` files and reading `process.env` with typed helpers.

Key features:
- Load `.env` values into `process.env`.
- Typed accessors for strings, enums, numbers, booleans, URLs, and collections.
- Strict schema-based env validation for production startup checks.
- Env-aware CSV parsing for comma-separated list variables.
- Runtime enforcement for uppercase env keys.
- Safe normalization of invalid values back to defaults.

## Installation

```bash
npm install @sourceregistry/node-env
```

```bash
npx jsr add @sourceregistry/node-env
```

## Usage

### Basic

```ts
import { env } from "@sourceregistry/node-env";

const appName = env.string("APP_NAME", "MyApp");
const sameSite = env.enum("PUBLIC_SESSION_SAME_SITE", ["strict", "lax", "none"] as const, "lax");
const port = env.number("PORT", 3000);
const debug = env.boolean("DEBUG", false);
```

### Defaults

If a key is missing or invalid, the accessor falls back to the provided default and normalizes `process.env` to that value.

```ts
const port = env.number("PORT", 3000);
const cache = env.boolean("ENABLE_CACHE", false);
```

### Booleans

Boolean parsing accepts `"true"`, `"1"`, `"yes"`, and `"on"` as `true`, and `"false"`, `"0"`, `"no"`, and `"off"` as `false`.

```ts
process.env.FLAG = "yes";
console.log(env.boolean("FLAG", false)); // true
```

### Collections

```ts
const api = env.collection("API_");
const config = env.collection("API_", {
  removePrefix: true,
  reviver: (value, key) => key === "TIMEOUT" ? Number(value) : value
});
```

### Production schema validation

Use `env.schema` when application startup should fail fast on invalid configuration.

```ts
import { env, SchemaValidationError } from "@sourceregistry/node-env";

const envSchema = env.schema.object({
  NODE_ENV: env.schema.enum(["development", "test", "production"] as const),
  PORT: env.schema.number({ integer: true, min: 1, default: 3000 }),
  DATABASE_URL: env.schema.url({ protocols: ["https:"] }),
  ENABLE_CACHE: env.schema.boolean({ default: false }),
  ALLOWED_HOSTS: env.schema.csv(),
});

try {
  const config = env.schema.parse(envSchema);

  config.PORT; // number
  config.DATABASE_URL; // URL
  config.ENABLE_CACHE; // boolean
  config.ALLOWED_HOSTS; // string[] | undefined
} catch (error) {
  if (error instanceof SchemaValidationError) {
    console.error(error.errors);
  }
  throw error;
}
```

Schema object keys must be uppercase:

```ts
env.schema.object({
  PORT: env.schema.number(),
  DATABASE_URL: env.schema.url(),
});
```

Use `env.schema.safeParse()` if you want a result object instead of an exception.

### Map directly to app config

Use `env.config.map()` when you want to define the final app config structure directly:

```ts
const runtimeConfig = env.config.map({
  nodeEnv: env.config.field(
    "NODE_ENV",
    env.schema.enum(["development", "test", "production"] as const, {
      default: "development",
    })
  ),
  serverPort: env.config.field(
    "PUBLIC_SERVER_PORT",
    env.schema.number({ integer: true, min: 1, max: 65_535, default: 3000 })
  ),
  allowedHosts: env.config.field(
    "PUBLIC_ALLOWED_HOSTS",
    env.schema.csv()
  ),
});
```

`env.config.safeMap()` returns `{ success, data | errors }` instead of throwing.

### Plug in another schema library

The package ships with a built-in dependency-free validator, but the root export also exposes `adaptSchema()` so you can wrap another runtime schema library later without coupling your app to an internal helper module.

```ts
import { adaptSchema, env, validation } from "@sourceregistry/node-env";

const externalSchema = {
  safeParse(value: unknown) {
    return typeof value === "string"
      ? { success: true as const, data: value }
      : { success: false as const, issues: [{ message: "Expected string" }] };
  },
};

const ExternalString = adaptSchema<typeof externalSchema, string>(externalSchema, {
  safeParse(schema, value) {
    return schema.safeParse(value);
  },
});

validation.parse(ExternalString, "ok");
env.config.field("APP_NAME", ExternalString);
```

### CSV env values

Use `env.schema.csv()` for comma-separated env variables:

```ts
const envSchema = env.schema.object({
  PUBLIC_ALLOWED_HOSTS: env.schema.csv(),
  PUBLIC_TRUSTED_PROXIES: env.schema.csv({
    default: ["127.0.0.1"],
  }),
});
```

## API Reference

| Method | Description |
| --- | --- |
| `env.string(key, default?)` | Return the variable as a string or the fallback. |
| `env.enum(key, values, default?)` | Return a string enum value or the fallback. |
| `env.number(key, default?)` | Return the variable as a number or the fallback. |
| `env.boolean(key, default?)` | Return the variable as a boolean or the fallback. |
| `env.url(key, default?)` | Return the variable as a `URL` or the fallback. |
| `env.has(key)` | Return `true` if the env key exists. |
| `env.defined(key)` | Return `true` if the env key exists and is not `undefined`. |
| `env.assert(keys, errorBuilder?)` | Throw if one or more required keys are missing. |
| `env.collection(prefix, options?)` | Return an object of env values that share a prefix. |
| `env.utils.select(key, TRUE, FALSE, predicate?)` | Select between two values based on an env predicate. |
| `env.dev` | Return `true` unless `NODE_ENV === "production"`. |
| `env.schema` | Build and parse typed env schemas from `process.env`. |
| `env.config` | Map validated env fields directly into your final app config object. |

## Testing

```bash
npm test
npm run test:coverage
npm run verify
npm run jsr:check
```

## Contributing

PRs are welcome. Please:
- Add tests for new features.
- Keep type-checking and tests green.
- Preserve the existing API guarantees unless a breaking change is intended.

Found a security issue? [Report it responsibly](mailto:a.p.a.slaa@projectsource.nl).

GitHub: [github.com/SourceRegistry/node-env](https://github.com/SourceRegistry/node-env)  
npm: [@sourceregistry/node-env](https://www.npmjs.com/package/@sourceregistry/node-env)  
JSR: [@sourceregistry/node-env](https://jsr.io/@sourceregistry/node-env)

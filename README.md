# 🧰 @sourceregistry/node-env
[![npm version](https://img.shields.io/npm/v/@sourceregistry/node-env?logo=npm)](https://www.npmjs.com/package/@sourceregistry/node-env)
[![License](https://img.shields.io/npm/l/@sourceregistry/node-env)](https://github.com/SourceRegistry/node-env/blob/main/LICENSE)
[![CI](https://github.com/SourceRegistry/node-env/actions/workflows/test.yml/badge.svg)](https://github.com/SourceRegistry/node-env/actions)
[![Codecov](https://img.shields.io/codecov/c/github/SourceRegistry/node-env)](https://codecov.io/gh/SourceRegistry/node-env)


## What is it?

`env` makes it safe and simple to load variables from `.env` and `process.env`, and access them in a typed manner: strings, numbers, booleans, collections.  
No dependencies, focus on runtime safety.

Key features:
- Load `.env` file (ignores comments, blank lines, quotes) and merge into `process.env`.
- Access variables via `.string()`, `.number()`, `.boolean()` with defaults.
- Check keys with `.has()`, `.defined()`.
- Get `env.dev` boolean for “development vs production” mode.
- Collect variables with a common prefix via `.collection()`, optional prefix removal & reviver.
- Utility method `.utils.select()` for feature‐flag style branching.

---

## Installation

```bash
npm install @sourceregistry/node-env
````
---

## Usage

### Basic

```ts
import { env } from "@sourceregistry/node-env";

console.log(env.string("APP_NAME", "MyApp"));       // => from .env or default
console.log(env.number("PORT", 3000));             // => number
console.log(env.boolean("DEBUG", false));          // => boolean
```

Suppose your `.env` file is:

```
APP_NAME=HelloWorld
PORT=8080
DEBUG=true
```

Then you’ll get:

```
HelloWorld
8080
true
```

---

### Defaults

If a key is absent, you can supply a default:

```ts
const value = env.string("MISSING_KEY", "fallback");
```

---

### Booleans

The boolean logic treats `"true"` or `"1"` (case-insensitive) as `true`; anything else as `false` (unless default).

```ts
process.env.FLAG = "1";
console.log(env.boolean("FLAG", false));  // => true
```

---

### Collections

When you have many environment variables prefixed in a group:

```ts
// .env
API_URL=https://api.example.com
API_KEY=abcdef
API_TIMEOUT=5000

// code
const api = env.collection("API_");
console.log(api);
// => { URL: "https://api.example.com", KEY: "abcdef", TIMEOUT: "5000" }
```

You can remove the prefix and apply a reviver:

```ts
const cfg = env.collection("API_", {
  removePrefix: true,
  reviver: (value, key) => key === "TIMEOUT" ? Number(value) : value
});
console.log(cfg);
// => { URL: "https://api.example.com", KEY: "abcdef", TIMEOUT: 5000 }
```

---

### Utility - select

A simple utility to select between two values based on the boolean state of an env key:

```ts
const mode = env.utils.select("FEATURE_X", "enabled", "disabled");
```

---

## API Reference

| Method                                           | Description                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `env.string(key, default?)`                      | Return the variable as a string (or default).                                                       |
| `env.number(key, default?)`                      | Parse variable to number (or default).                                                              |
| `env.boolean(key, default?)`                     | Parse variable to boolean (or default).                                                             |
| `env.has(key)`                                   | Returns true if key exists in `process.env`.                                                        |
| `env.defined(key)`                               | Returns true if key exists and value is not `undefined`.                                            |
| `env.dev`                                        | Boolean flag: true if `NODE_ENV !== "production"`.                                                  |
| `env.collection(prefix, options?)`               | Get an object of all env keys starting with `prefix`. Options include `removePrefix` and `reviver`. |
| `env.utils.select(key, TRUE, FALSE, predicate?)` | Return `TRUE` or `FALSE` depending on the predicate result on the env key.                          |

---

🧪 **Testing**
This library has 100% test coverage with Vitest:
```bash
npm test
npm run test:coverage
```

---

## Contributing

Contributions are very welcome!
Please open issues for bugs or feature requests and pull requests for changes.
Follow the standard fork → branch → PR workflow.

---

🙌 **Contributing**
PRs welcome! Please:
- Add tests for new features
- Maintain 100% coverage
- Follow existing code style

Found a security issue? [Report it responsibly](mailto:a.p.a.slaa@projectsource.nl).

🔗 **GitHub**: [github.com/SourceRegistry/node-env](https://github.com/SourceRegistry/node-env)  
📦 **npm**: [@sourceregistry/node-env](https://www.npmjs.com/package/@sourceregistry/node-env)

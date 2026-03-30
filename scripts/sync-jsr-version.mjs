import {readFileSync, writeFileSync} from "node:fs";

const packageJsonPath = new URL("../package.json", import.meta.url);
const jsrJsonPath = new URL("../jsr.json", import.meta.url);

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const jsrJson = JSON.parse(readFileSync(jsrJsonPath, "utf8"));

if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("package.json is missing a valid version");
}

jsrJson.version = packageJson.version;

writeFileSync(jsrJsonPath, `${JSON.stringify(jsrJson, null, 2)}\n`);

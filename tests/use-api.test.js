import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (await readFile(new URL("../src/composables/useApi.js", import.meta.url), "utf8"))
    .replace(/^import .*\n/, "")
    .replace("import.meta.env.VITE_PIPED_API", "'/api'");
const { fetchJson } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

test("same-origin API searches preserve query parameters", async t => {
    const previousFetch = globalThis.fetch;
    const previousWindow = globalThis.window;
    t.after(() => { globalThis.fetch = previousFetch; globalThis.window = previousWindow; });
    globalThis.window = { location: { origin: "https://tesplay.sachabc.com" } };
    let requested;
    globalThis.fetch = async url => { requested = new URL(url); return Response.json({ items: [] }); };
    assert.deepEqual(await fetchJson("/api/search", { q: "music & live", filter: "videos" }), { items: [] });
    assert.equal(requested.origin, "https://tesplay.sachabc.com");
    assert.equal(requested.pathname, "/api/search");
    assert.equal(requested.searchParams.get("q"), "music & live");
    assert.equal(requested.searchParams.get("filter"), "videos");
    await fetchJson("https://other.example/search", { q: "test" });
    assert.equal(requested.origin, "https://other.example");
});

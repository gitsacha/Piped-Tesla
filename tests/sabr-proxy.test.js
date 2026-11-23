import assert from "node:assert/strict";
import test from "node:test";
import { SabrPlayerAdapter } from "../src/utils/SabrPlayerAdapter.js";

test("SABR POST uses our proxy while preserving its logical URL and request body", async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let fetched;
    globalThis.fetch = async (url, init) => {
        fetched = { url, init };
        const response = new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        Object.defineProperty(response, "url", { value: "https://piped.example/proxy/videoplayback" });
        return response;
    };
    const adapter = new SabrPlayerAdapter({ util: { Error } }, null, null, "https://piped.example/proxy");
    const uri = "https://rr1.googlevideo.com/videoplayback?token=example";
    const body = new Uint8Array([4, 5]);
    const response = await adapter.request(
        uri, { sabrUri: "sabr://video", headers: {} }, 1,
        { method: "POST", body }, new AbortController(), {}, () => {}, () => {}, 0,
    );
    const url = new URL(fetched.url);
    assert.equal(url.origin, "https://piped.example");
    assert.equal(url.pathname, "/proxy/videoplayback");
    assert.equal(url.searchParams.get("host"), "rr1.googlevideo.com");
    assert.equal(url.searchParams.get("token"), "example");
    assert.equal(fetched.init.method, "POST");
    assert.equal(fetched.init.body, body);
    assert.equal(response.uri, uri);
});

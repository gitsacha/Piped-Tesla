import assert from "node:assert/strict";
import test from "node:test";
import { CanvasPlayerEngine } from "../src/utils/canvasPlayer.js";

test("continues fetching when a proxy reports a chunk length as the file length", async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    const requests = [];
    globalThis.fetch = async (_url, options) => {
        requests.push(options.headers.Range);
        const size = requests.length === 1 ? 1024 * 1024 : 1024 * 1024 * 2;
        return new Response(new Uint8Array(size), {
            status: 206,
            headers: { "Content-Range": `bytes 0-${size - 1}/${size}` },
        });
    };
    const player = new CanvasPlayerEngine(null, null);
    player.videoUrl = "https://example.test/videoplayback";
    player.mp4box = { appendBuffer() {} };
    player.isReady = true;

    await player.fetchChunk(0, 1024 * 1024);
    await player.bufferAhead();

    assert.deepEqual(requests, ["bytes=0-1048575", "bytes=1048576-3145727"]);
    assert.equal(player.currentByteOffset, 3145728);
});

test("a short final chunk establishes EOF and stops fetching", async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    let requests = 0;
    globalThis.fetch = async () => {
        requests++;
        return new Response(new Uint8Array(123), { status: 206 });
    };
    const player = new CanvasPlayerEngine(null, null);
    player.videoUrl = "https://example.test/videoplayback";
    player.mp4box = { appendBuffer() {} };
    player.isReady = true;

    await player.fetchChunk(0, 1024);
    await player.bufferAhead();

    assert.equal(player.totalBytes, 123);
    assert.equal(requests, 1);
});

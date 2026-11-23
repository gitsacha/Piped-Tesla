import assert from "node:assert/strict";
import test from "node:test";
import { CanvasPlayerEngine } from "../src/utils/canvasPlayer.js";

function fixture(t, initialTracks = []) {
    const stream = new EventTarget();
    const tracks = [...initialTracks];
    stream.getTracks = () => tracks;
    stream.getVideoTracks = () => tracks.filter(track => track.kind === "video");
    stream.add = track => {
        tracks.push(track);
        const event = new Event("addtrack");
        event.track = track;
        stream.dispatchEvent(event);
    };
    const original = globalThis.MediaStreamTrackProcessor;
    let controller;
    let cancelled = false;
    globalThis.MediaStreamTrackProcessor = class {
        constructor() {
            this.readable = new ReadableStream({
                start(value) { controller = value; },
                cancel() { cancelled = true; },
            });
        }
    };
    t.after(() => { globalThis.MediaStreamTrackProcessor = original; });
    const painted = [];
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: frame => painted.push(frame) }) };
    const engine = new CanvasPlayerEngine(canvas, Object.assign(new EventTarget(), { captureStream: () => stream }));
    t.after(() => engine.destroy());
    return { engine, stream, canvas, painted, frame: value => controller.enqueue(value), cancelled: () => cancelled };
}

test("draws decoded video frames and releases them without a video element", async t => {
    let stopped = false;
    const f = fixture(t, [{ kind: "video", stop: () => { stopped = true; } }]);
    f.engine.start();
    let closed = 0;
    const frame = { displayWidth: 640, displayHeight: 360, close: () => closed++ };
    f.frame(frame);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.painted, [frame]);
    assert.equal(f.canvas.width, 640);
    assert.equal(f.canvas.height, 360);
    assert.equal(closed, 1);
    f.engine.destroy();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, true);
    assert.equal(f.cancelled(), true);
});

test("starts rendering when the media source adds its video track later", async t => {
    const f = fixture(t);
    f.engine.start();
    f.stream.add({ kind: "video", stop() {} });
    const frame = { displayWidth: 320, displayHeight: 180, close() {} };
    f.frame(frame);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.painted, [frame]);
});

test("rejects unavailable browser capabilities with a useful error", () => {
    const engine = new CanvasPlayerEngine({ getContext: () => ({}) }, new EventTarget());
    assert.throws(() => engine.start(), /Video rendering is unavailable/);
});

test("destroy closes a pending frame without painting it", async t => {
    const f = fixture(t, [{ kind: "video", stop() {} }]);
    f.engine.start();
    let closed = 0;
    f.frame({ displayWidth: 640, displayHeight: 360, close: () => closed++ });
    f.engine.destroy();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, 1);
    assert.equal(f.painted.length, 0);
});

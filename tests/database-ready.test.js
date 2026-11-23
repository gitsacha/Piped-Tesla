import assert from "node:assert/strict";
import test from "node:test";
import { getChannelGroups, createOrUpdateChannelGroup } from "../src/composables/useChannelGroups.js";

test("local data reads wait for IndexedDB initialization on the first page load", async t => {
    const original = globalThis.window;
    t.after(() => { globalThis.window = original; });
    let open;
    globalThis.window = { dbReady: new Promise(resolve => { open = resolve; }) };
    const result = getChannelGroups().then(value => ({ value }), error => ({ error }));
    await new Promise(resolve => setImmediate(resolve));
    let transactions = 0;
    window.db = {
        transaction() {
            transactions++;
            const request = {};
            setImmediate(() => request.onsuccess({ target: { result: null } }));
            return { objectStore: () => ({ index: () => ({ openCursor: () => request }) }) };
        },
    };
    open(window.db);
    const completed = await result;
    assert.ifError(completed.error);
    assert.deepEqual(completed.value, []);
    assert.equal(transactions, 1);
});

test("local writes wait for storage and reject unavailable storage", async t => {
    const original = globalThis.window;
    t.after(() => { globalThis.window = original; });
    let ready;
    globalThis.window = { dbReady: new Promise(resolve => { ready = resolve; }) };
    const writes = [];
    const result = createOrUpdateChannelGroup({ groupName: "Music", channels: ["test"] });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(writes, []);
    window.db = { transaction: () => ({ objectStore: () => ({ put: value => writes.push(value) }) }) };
    ready(window.db);
    await result;
    assert.deepEqual(writes, [{ groupName: "Music", channels: '["test"]' }]);
    window.db = null;
    await assert.rejects(createOrUpdateChannelGroup({}), /Local storage is unavailable/);
});

export async function getChannelGroups() {
    await window.dbReady;
    if (!window.db) return [];
    return new Promise(resolve => {
        let channelGroups = [];
        var tx = window.db.transaction("channel_groups", "readonly");
        var store = tx.objectStore("channel_groups");
        const cursor = store.index("groupName").openCursor();
        cursor.onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) {
                const group = cursor.value;
                channelGroups.push({
                    groupName: group.groupName,
                    channels: JSON.parse(group.channels),
                });
                cursor.continue();
            } else {
                resolve(channelGroups);
            }
        };
    });
}

export async function createOrUpdateChannelGroup(group) {
    await window.dbReady;
    if (!window.db) throw new Error("Local storage is unavailable. Reload and try again.");
    var tx = window.db.transaction("channel_groups", "readwrite");
    var store = tx.objectStore("channel_groups");
    store.put({
        groupName: group.groupName,
        channels: JSON.stringify(group.channels),
    });
}

export async function deleteChannelGroup(groupName) {
    await window.dbReady;
    if (!window.db) throw new Error("Local storage is unavailable. Reload and try again.");
    var tx = window.db.transaction("channel_groups", "readwrite");
    var store = tx.objectStore("channel_groups");
    store.delete(groupName);
}

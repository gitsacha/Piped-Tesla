const find = selector => document.querySelector(selector);
const defaultSet = { id: "8Pa9x9fZBtY", title: "Dire Straits · Alchemy Live", time: 0 };
const videoId = /^[\w-]{11}$/;

function stored(key, fallback, storage = localStorage) {
    try {
        return JSON.parse(storage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function watchLink(video, audioOnly, extras = {}) {
    const query = { v: video.id, listen: audioOnly ? "1" : "0", ...extras };
    if (audioOnly) query.car = "1";
    return "/watch?" + new URLSearchParams(query);
}

const last = stored("tesplay:last", defaultSet);
const resumed = videoId.test(last?.id) ? last : defaultSet;
const offset = resumed.time >= 1 ? { t: Math.floor(resumed.time) } : {};
const list = resumed.list ? { list: resumed.list, index: resumed.index ?? 0 } : {};
if (resumed !== defaultSet) {
    find("#resume").href = watchLink(resumed, true, {
        ...offset,
        ...list,
        ...(resumed.queue ? { tesplayQueue: 1 } : {}),
    });
    find("#resume").textContent = "Resume";
    find("#resume-title").textContent = resumed.title || "Last recording";
}

function parseLink(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname;
    let id;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    if (
        ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host) ||
        (url.origin === location.origin && url.pathname === "/watch")
    ) {
        id = url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1];
    }
    return { url, id: videoId.test(id) ? id : null };
}

async function relay(path, { body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    return fetch("/tesplay/relay/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
    });
}

async function showQr(element, link) {
    const response = await relay("qr", { body: { link } });
    if (!response.ok || response.headers.get("content-type") !== "image/svg+xml") {
        throw new Error("Could not generate the QR code. Check the connection and try again.");
    }
    if (element.src.startsWith("blob:")) URL.revokeObjectURL(element.src);
    element.src = URL.createObjectURL(await response.blob());
    element.hidden = false;
    await element.decode();
    element.scrollIntoView({ block: "nearest" });
}

const pair = find("#pair");
const pairStatus = find("#pair-status");
let pairing = stored("tesplay:pair", null, sessionStorage);
let inbox = stored("tesplay:inbox", [], sessionStorage);
let queue = stored("tesplay:queue", []);
let polling = false;
let pairTimer;

function labelFor(item) {
    const link = parseLink(item.link);
    return item.title || (link.id ? "YouTube · " + link.id : link.url.hostname + link.url.pathname);
}

function button(text, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.addEventListener("click", handler);
    return element;
}

function actionLink(text, href) {
    const link = document.createElement("a");
    link.className = "button";
    link.textContent = text;
    link.href = href;
    return link;
}

function clearInbox(id) {
    inbox = inbox.filter(item => item.id !== id);
    sessionStorage.setItem("tesplay:inbox", JSON.stringify(inbox));
    renderInbox();
}

function renderInbox() {
    const rows = inbox.map(item => {
        const link = parseLink(item.link);
        const row = document.createElement("li");
        row.append(labelFor(item));
        const actions = document.createElement("div");
        actions.className = "actions";
        const play = actionLink(link.id ? "Play now" : "Open", link.id ? watchLink(link, true) : link.url.href);
        play.addEventListener("click", () => clearInbox(item.id));
        actions.append(play);
        if (link.id) {
            actions.append(
                button("Queue", () => {
                    queue = [
                        ...queue.filter(video => video.id !== link.id),
                        { id: link.id, title: item.title || labelFor(item) },
                    ].slice(-30);
                    localStorage.setItem("tesplay:queue", JSON.stringify(queue));
                    clearInbox(item.id);
                    renderQueue();
                }),
            );
            const save = actionLink("Save to a set", watchLink(link, true, { tesplaySave: 1 }));
            save.addEventListener("click", () => clearInbox(item.id));
            actions.append(save);
        }
        actions.append(button("Dismiss", () => clearInbox(item.id)));
        row.append(actions);
        return row;
    });
    find("#inbox").replaceChildren(...rows);
}

function renderQueue() {
    find("#queued").hidden = queue.length === 0;
    find("#queue").replaceChildren(
        ...queue.map((item, index) => {
            const row = document.createElement("li");
            row.append(item.title || item.id);
            const actions = document.createElement("div");
            actions.className = "actions";
            const play = actionLink(
                index === 0 ? "Play queue" : "Play from here",
                watchLink(item, true, { tesplayQueue: 1 }),
            );
            play.addEventListener("click", () => {
                queue = queue.slice(index + 1);
                localStorage.setItem("tesplay:queue", JSON.stringify(queue));
            });
            actions.append(
                play,
                button("Remove", () => {
                    queue = queue.filter(candidate => candidate.id !== item.id);
                    localStorage.setItem("tesplay:queue", JSON.stringify(queue));
                    renderQueue();
                }),
            );
            row.append(actions);
            return row;
        }),
    );
}

async function pollInbox() {
    if (polling || !pairing || location.hash !== "#phone") return;
    polling = true;
    const current = pairing;
    try {
        const response = await relay("inbox?after=" + (current.after || 0), { token: current.receive });
        if (current !== pairing) return;
        if (response.status === 401) {
            pairing = null;
            sessionStorage.removeItem("tesplay:pair");
            clearInterval(pairTimer);
            find("#pair-code").hidden = true;
            find("#sender-link").hidden = true;
            pairStatus.textContent = "Pairing expired. Show a new code to reconnect.";
            pair.textContent = "Show pairing code";
            return;
        }
        if (!response.ok) throw new Error();
        const { items } = await response.json();
        if (!items.length) return;
        pairing.after = items.at(-1).id;
        inbox = [...inbox, ...items].slice(-30);
        sessionStorage.setItem("tesplay:pair", JSON.stringify(pairing));
        sessionStorage.setItem("tesplay:inbox", JSON.stringify(inbox));
        pairStatus.textContent = "Link received.";
        renderInbox();
        for (const item of items) {
            const link = parseLink(item.link);
            if (!link?.id) continue;
            void fetch("/api/streams/" + link.id, { signal: AbortSignal.timeout(8000) })
                .then(response => (response.ok ? response.json() : {}))
                .then(({ title }) => {
                    if (title && inbox.includes(item)) {
                        item.title = title;
                        sessionStorage.setItem("tesplay:inbox", JSON.stringify(inbox));
                        renderInbox();
                    }
                })
                .catch(() => {});
        }
    } catch {
        if (current === pairing) pairStatus.textContent = "Waiting for the connection to return…";
    } finally {
        polling = false;
    }
}

function startPolling() {
    if (!pairing) return;
    clearInterval(pairTimer);
    void pollInbox();
    pairTimer = setInterval(pollInbox, 1800);
}

pair.addEventListener("click", async () => {
    pair.disabled = true;
    try {
        if (!pairing) {
            const response = await relay("session", { body: {} });
            if (!response.ok) throw new Error("Could not start pairing. Check the connection and try again.");
            pairing = await response.json();
            sessionStorage.setItem("tesplay:pair", JSON.stringify(pairing));
        }
        const url = new URL("/tesplay/send.html", location.origin);
        url.hash = pairing.send;
        await showQr(find("#pair-code"), url.href);
        find("#sender-link").href = url.href;
        find("#sender-link").hidden = false;
        pairStatus.textContent = "Ready. Keep this panel open while sending.";
        startPolling();
    } catch (error) {
        pairStatus.textContent = error.message;
    } finally {
        pair.disabled = false;
    }
});

renderInbox();
renderQueue();
if (location.hash === "#phone") startPolling();

const displayAddress = find("#display-address");
displayAddress.value = localStorage.getItem("tesplay:macAddress") || "";
displayAddress.addEventListener("input", () => displayAddress.setCustomValidity(""));
find("#desktop-form").addEventListener("submit", event => {
    event.preventDefault();
    const link = parseLink(displayAddress.value);
    if (!link) {
        displayAddress.setCustomValidity("Enter an HTTP or HTTPS display address without login details.");
        displayAddress.reportValidity();
        return;
    }
    localStorage.setItem("tesplay:macAddress", link.url.href);
    location.assign(link.url.href);
});

find("#passenger-qr").addEventListener("click", async () => {
    const status = find("#video-status");
    try {
        const url = new URL(watchLink(resumed, false, offset), location.origin);
        await showQr(find("#video-code"), url.href);
        status.textContent = resumed.title + " · opens on the device that scans it";
    } catch (error) {
        status.textContent = error.message;
    }
});

const follow = find("#follow");
const roadStatus = find("#road-status");
const map = find("#road-map");
let roadWatch;
let roadPosition;

function stopFollowing() {
    if (roadWatch === undefined) return;
    navigator.geolocation.clearWatch(roadWatch);
    roadWatch = undefined;
    roadPosition = undefined;
    follow.textContent = "Follow my location";
    roadStatus.textContent = "Location follow paused.";
}

follow.addEventListener("click", () => {
    if (roadWatch !== undefined) {
        stopFollowing();
        return;
    }
    if (!navigator.geolocation) {
        roadStatus.textContent = "GPS is unavailable in this browser.";
        return;
    }
    follow.textContent = "Stop following";
    roadStatus.textContent = "Waiting for GPS…";
    roadWatch = navigator.geolocation.watchPosition(
        ({ coords }) => {
            const { latitude, longitude } = coords;
            if (roadPosition && Date.now() - roadPosition.time < 6500) return;
            if (
                roadPosition &&
                Math.hypot(latitude - roadPosition.latitude, longitude - roadPosition.longitude) < 0.0015
            ) {
                roadStatus.textContent = "Following your location.";
                return;
            }
            const url = new URL("https://embed.waze.com/iframe");
            url.search = new URLSearchParams({ lat: latitude.toFixed(4), lon: longitude.toFixed(4), zoom: 14 });
            map.src = url.href;
            map.hidden = false;
            roadPosition = { latitude, longitude, time: Date.now() };
            roadStatus.textContent = "Following your location.";
        },
        error => {
            if (error.code === 1) stopFollowing();
            roadStatus.textContent =
                error.code === 1 ? "Allow location in browser settings to follow the map." : "Waiting for GPS…";
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
});

window.addEventListener("hashchange", () => {
    if (location.hash !== "#route") stopFollowing();
    if (location.hash === "#phone") startPolling();
    else clearInterval(pairTimer);
});

const engineProfiles = {
    v8: { waveform: "triangle", harmonics: [1, 2.02, 3], idle: 43, sweep: 133 },
    inline: { waveform: "triangle", harmonics: [1, 2, 4.06], idle: 53, sweep: 156 },
    electric: { waveform: "sine", harmonics: [1, 1.5, 2.01], idle: 80, sweep: 340 },
};
const engineProfile = find("#engine-profile");
const engineToggle = find("#engine-toggle");
const engineStatus = find("#engine-status");
const shiftSpeeds = [0, 9, 17, 26, 35, 46, 60];
let engine;

function tuneEngine() {
    if (!engine) return;
    const profile = engineProfiles[engineProfile.value];
    const now = engine.audio.currentTime;
    const speed = engine.speed;
    const pull = Math.max(0, Math.min(1, engine.acceleration / 2.4));
    const automatic = engineProfile.value !== "electric";
    if (automatic && engine.gear < shiftSpeeds.length - 2 && speed > shiftSpeeds[engine.gear + 1] + pull * 2)
        engine.gear++;
    if (automatic && engine.gear > 0 && speed < shiftSpeeds[engine.gear] - 2) engine.gear--;
    const revs = automatic
        ? (speed - shiftSpeeds[engine.gear]) / (shiftSpeeds[engine.gear + 1] - shiftSpeeds[engine.gear])
        : speed / 42;
    const pitch = profile.idle + (Math.max(0, Math.min(1, revs)) * 0.84 + pull * 0.16) * profile.sweep;
    for (const [index, oscillator] of engine.oscillators.entries()) {
        oscillator.type = profile.waveform;
        oscillator.frequency.setTargetAtTime(pitch * profile.harmonics[index], now, 0.13);
    }
    engine.gain.gain.setTargetAtTime(0.017 + 0.035 * pull + 0.014 * Math.min(1, speed / 22), now, 0.12);
}

function updateEngine(position) {
    if (!engine) return;
    const { coords, timestamp } = position;
    const previous = engine.position;
    engine.position = position;
    let speed = coords.speed;
    const elapsed = previous ? (timestamp - previous.timestamp) / 1000 : 0;
    if (speed === null && elapsed >= 0.5 && elapsed < 8) {
        const north = (coords.latitude - previous.coords.latitude) * 111195;
        const east =
            (coords.longitude - previous.coords.longitude) * 111195 * Math.cos((coords.latitude * Math.PI) / 180);
        const distance = Math.hypot(north, east);
        speed = distance > Math.max(2.5, coords.accuracy * 0.4) ? distance / elapsed : 0;
    }
    if (!Number.isFinite(speed) || speed < 0 || speed > 100) {
        engineStatus.textContent = "Waiting for a GPS speed reading. Engine is idling.";
        return;
    }
    const target = speed < 1 ? 0 : speed;
    engine.acceleration = elapsed >= 0.5 ? (target - engine.speed) / Math.min(4, elapsed) : 0;
    engine.speed = target;
    engine.lastFix = Date.now();
    tuneEngine();
    engineStatus.textContent =
        Math.round(target * 2.237) +
        " mph · " +
        (engineProfile.value === "electric" ? "Electric" : "Gear " + (engine.gear + 1));
}

function stopEngine() {
    if (!engine) return;
    const { audio, oscillators, gain, watchId, timer } = engine;
    engine = undefined;
    navigator.geolocation.clearWatch(watchId);
    clearInterval(timer);
    gain.gain.setTargetAtTime(0, audio.currentTime, 0.025);
    for (const oscillator of oscillators) oscillator.stop(audio.currentTime + 0.15);
    setTimeout(() => {
        void audio.close();
    }, 200);
    engineToggle.textContent = "Start engine";
    engineStatus.textContent = "Engine stopped.";
}

engineToggle.addEventListener("click", async () => {
    if (engine) {
        stopEngine();
        return;
    }
    engineToggle.disabled = true;
    let audio;
    try {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio || !navigator.geolocation)
            throw new Error("This browser needs Web Audio and GPS to run the engine.");
        audio = new Audio();
        await audio.resume();
        const gain = audio.createGain();
        gain.gain.value = 0;
        gain.connect(audio.destination);
        const oscillators = [0.65, 0.23, 0.12].map(level => {
            const oscillator = audio.createOscillator();
            const partial = audio.createGain();
            partial.gain.value = level;
            oscillator.connect(partial).connect(gain);
            oscillator.start();
            return oscillator;
        });
        engine = { audio, gain, oscillators, speed: 0, acceleration: 0, gear: 0, lastFix: Date.now() };
        tuneEngine();
        engine.watchId = navigator.geolocation.watchPosition(
            updateEngine,
            error => {
                if (error.code === 1) {
                    stopEngine();
                    engineStatus.textContent = "Allow location in browser settings to use live engine sounds.";
                }
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 1200 },
        );
        engine.timer = setInterval(() => {
            if (Date.now() - engine.lastFix > 7000) {
                engine.speed = 0;
                engine.gear = 0;
                engine.acceleration = 0;
                tuneEngine();
                engineStatus.textContent = "GPS signal lost. Engine is idling.";
            }
        }, 1500);
        engineToggle.textContent = "Stop engine";
        engineStatus.textContent = "Idling. Waiting for GPS…";
    } catch (error) {
        engine = undefined;
        if (audio) void audio.close();
        engineStatus.textContent = error.message;
    } finally {
        engineToggle.disabled = false;
    }
});
engineProfile.addEventListener("change", tuneEngine);
window.addEventListener("pagehide", stopEngine);

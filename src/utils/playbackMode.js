import { getPreferenceBoolean } from "@/composables/usePreferences.js";

let teslaEntry = false;
const teslaSessionKey = "tesplay:car";

export function rememberTeslaEntry() {
    teslaEntry = new URLSearchParams(window.location.search).get("car") === "1";
    try {
        if (teslaEntry) window.sessionStorage.setItem(teslaSessionKey, "1");
        else teslaEntry = window.sessionStorage.getItem(teslaSessionKey) === "1";
    } catch {
        // The explicit entry still applies to this page when storage is restricted.
    }
}

export function isTeslaBrowser() {
    return teslaEntry || navigator.userAgent.includes("Tesla");
}

export function defaultListenMode() {
    const query = new URLSearchParams(window.location.search);
    return isTeslaBrowser() && query.get("tesla") !== "true" && query.get("canvas") !== "true";
}

export function isListeningTo(video) {
    return Boolean(
        !video?.livestream && video?.audioStreams?.length && getPreferenceBoolean("listen", defaultListenMode()),
    );
}

export function selectAudioStream(streams, supports, language) {
    const compatible = streams.filter(
        stream => stream.url && stream.codec && supports(`${stream.mimeType}; codecs="${stream.codec}"`),
    );
    const preferred = compatible.filter(stream => stream.audioTrackId?.split("-")[0] === language);
    const original = compatible.filter(
        stream => !stream.audioTrackId || stream.audioTrackType?.toLowerCase() === "original",
    );
    const candidates = preferred.length ? preferred : original.length ? original : compatible;
    return candidates.sort((a, b) => b.bitrate - a.bitrate)[0];
}

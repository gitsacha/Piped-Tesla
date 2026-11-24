import { getPreferenceBoolean } from "@/composables/usePreferences.js";

export function isTeslaBrowser() {
    return navigator.userAgent.includes("Tesla");
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

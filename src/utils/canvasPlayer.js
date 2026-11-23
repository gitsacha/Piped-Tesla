/** Draw the audio element's decoded video track without creating a video element. */
export class CanvasPlayerEngine {
    constructor(canvas, mediaClock, onError = () => {}) {
        this.canvas = canvas;
        this.context = canvas?.getContext("2d");
        this.mediaClock = mediaClock;
        this.onError = onError;
        this.stream = null;
        this.reader = null;
        this.destroyed = false;
        this.onTrack = event => this.renderTrack(event.track);
    }

    start() {
        if (!this.mediaClock?.captureStream || !globalThis.MediaStreamTrackProcessor || !this.context) {
            throw new Error("Video rendering is unavailable in this browser.");
        }
        this.stream = this.mediaClock.captureStream();
        this.stream.addEventListener("addtrack", this.onTrack);
        this.stream.getVideoTracks().forEach(track => this.renderTrack(track));
    }

    async renderTrack(track) {
        if (track.kind !== "video" || this.destroyed) return;
        this.reader?.cancel().catch(() => {});
        let reader;
        try {
            reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
            this.reader = reader;
            while (!this.destroyed && this.reader === reader) {
                const { value: frame, done } = await reader.read();
                if (done) break;
                try {
                    if (this.destroyed || this.reader !== reader) break;
                    if (this.canvas.width !== frame.displayWidth) this.canvas.width = frame.displayWidth;
                    if (this.canvas.height !== frame.displayHeight) this.canvas.height = frame.displayHeight;
                    this.context.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
                } finally {
                    frame.close();
                }
            }
        } catch (error) {
            if (!this.destroyed && (!reader || this.reader === reader)) this.onError(error);
        } finally {
            reader?.releaseLock();
            if (this.reader === reader) this.reader = null;
        }
    }

    destroy() {
        this.destroyed = true;
        this.stream?.removeEventListener("addtrack", this.onTrack);
        this.reader?.cancel().catch(() => {});
        this.reader = null;
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
    }
}

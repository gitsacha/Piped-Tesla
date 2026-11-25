const form = document.querySelector("#send-form");
const input = document.querySelector("#send-url");
const status = document.querySelector("#send-status");
const button = form.querySelector("button");
let token;
let sending = false;
function readPairing() {
    const pairing = location.hash.slice(1);
    if (/^[\w-]{32}$/.test(pairing)) {
        sessionStorage.setItem("tesplaySender", pairing);
        history.replaceState(null, "", location.pathname);
    }
    token = sessionStorage.getItem("tesplaySender");
    status.textContent = token
        ? "Paste a link copied from the iPhone Share menu."
        : "Scan the pairing code on the car first.";
    button.disabled = !token || sending;
}

readPairing();
window.addEventListener("hashchange", readPairing);

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!token || sending) return;
    const sendingToken = token;
    sending = true;
    button.disabled = true;
    try {
        const response = await fetch("/tesplay/relay/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + sendingToken },
            body: JSON.stringify({ link: input.value.trim() }),
        });
        if (response.status === 401) {
            if (token === sendingToken) {
                sessionStorage.removeItem("tesplaySender");
                token = null;
            }
            throw new Error("Pair again from the car.");
        }
        if (!response.ok) throw new Error("Use an HTTP or HTTPS link and try again.");
        input.value = "";
        status.textContent = "Sent. Open, queue, or save it from the car.";
    } catch (error) {
        status.textContent = error.message;
    } finally {
        sending = false;
        button.disabled = !token;
    }
});

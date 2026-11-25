const form = document.querySelector("#send-form");
const input = document.querySelector("#send-url");
const status = document.querySelector("#send-status");
const button = form.querySelector("button");
const pairing = location.hash.slice(1);
if (/^[\w-]{32}$/.test(pairing)) {
    sessionStorage.setItem("tesplaySender", pairing);
    history.replaceState(null, "", location.pathname);
}
const token = sessionStorage.getItem("tesplaySender");
status.textContent = token
    ? "Paste a link copied from the iPhone Share menu."
    : "Scan the pairing code on the car first.";
button.disabled = !token;

form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    try {
        const response = await fetch("/tesplay/relay/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ link: input.value.trim() }),
        });
        if (response.status === 401) throw new Error("Pair again from the car.");
        if (!response.ok) throw new Error("Use an HTTP or HTTPS link and try again.");
        input.value = "";
        status.textContent = "Sent. Open, queue, or save it from the car.";
    } catch (error) {
        status.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

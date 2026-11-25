import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

const lifetime = 8 * 60 * 60 * 1000;
const readers = new Map();
const senders = new Map();

function token() {
    return randomBytes(24).toString("base64url");
}

function json(response, status, body) {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
}

async function readJson(request) {
    if (request.headers["content-type"]?.split(";")[0] !== "application/json") {
        throw new Error("Expected JSON");
    }
    let text = "";
    for await (const chunk of request) {
        text += chunk;
        if (text.length > 4096) throw new Error("Request too large");
    }
    return JSON.parse(text);
}

const server = createServer(async (request, response) => {
    const path = request.url?.split("?")[0];
    const auth = request.headers.authorization?.match(/^Bearer ([\w-]{32})$/)?.[1];
    try {
        if (path === "/health" && request.method === "GET") return json(response, 200, { ok: true });

        if (path === "/session" && request.method === "POST") {
            await readJson(request);
            for (const session of readers.values()) {
                if (session.expires <= Date.now()) {
                    readers.delete(session.receive);
                    senders.delete(session.send);
                }
            }
            if (readers.size >= 100) return json(response, 503, { error: "Too many active pairings." });
            const session = { receive: token(), send: token(), expires: Date.now() + lifetime, items: [], sequence: 0 };
            readers.set(session.receive, session);
            senders.set(session.send, session);
            return json(response, 201, { receive: session.receive, send: session.send });
        }

        if (path === "/qr" && request.method === "POST") {
            const { link } = await readJson(request);
            if (typeof link !== "string" || link.length > 1000) return json(response, 400, { error: "Invalid link." });
            const svg = await QRCode.toString(link, { type: "svg", margin: 4, errorCorrectionLevel: "M" });
            response.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
            return response.end(svg);
        }

        const session = (path === "/inbox" ? readers : senders).get(auth);
        if (!session || session.expires <= Date.now()) {
            return json(response, 401, { error: "Pair the phone again from TesPlay." });
        }
        if (path === "/inbox" && request.method === "GET") {
            const after = Number(new URL(request.url, "http://localhost").searchParams.get("after")) || 0;
            return json(response, 200, { items: session.items.filter(item => item.id > after) });
        }
        if (path === "/send" && request.method === "POST") {
            const { link: value } = await readJson(request);
            if (typeof value !== "string" || value.length > 2048)
                return json(response, 400, { error: "Invalid link." });
            const link = new URL(value);
            if (!["https:", "http:"].includes(link.protocol) || link.username || link.password) {
                return json(response, 400, { error: "Use an HTTP or HTTPS link without login details." });
            }
            session.items.push({ id: ++session.sequence, link: link.href });
            if (session.items.length > 30) session.items.shift();
            return json(response, 201, { ok: true });
        }
        return json(response, 404, { error: "Unknown endpoint." });
    } catch {
        if (!response.headersSent) json(response, 400, { error: "Invalid request." });
    }
});

server.listen(Number(process.env.TESPLAY_RELAY_PORT || 8091), "127.0.0.1");

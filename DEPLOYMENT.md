# Sacha deployment

This is the local fork of `unbe/Piped-Tesla`, deployed at `https://tesplay.sachabc.com` on sachabc through the existing personal Coolify application. Local checkout: `/Users/sacha/src/personal/oss/piped-tesla`. `origin` is the upstream Tesla fork, `upstream` is TeamPiped/Piped, and `fork` is gitsacha/Piped-Tesla. The deployment branch is `sachabc`.

`compose.coolify.yml` runs the frontend, Piped backend, stream proxy, private BotGuard helper, private player decoder and PostgreSQL 17. Only the frontend is routed publicly. Nginx puts API and media requests under the same origin, so the existing Cloudflare Access session covers playback as well as browsing. It strips the browser's cookies before forwarding to the backend or media proxy. SponsorBlock remains enabled by the upstream frontend defaults.

The deployed homepage serves the TesPlay launcher from `public/tesplay/`. The Piped tile opens `/piped`, which follows the saved Piped homepage preference. Piped's navigation has a TesPlay link back to `/`. Existing video, account and API routes share the same hostname and browser storage. The launcher also offers a Mac display URL opener, Waze links, a charging calculator and a manual engine-sound demo.

On Tesla, recordings with separate audio default to **Audio only** unless the viewer saved a different preference. This mode selects the highest compatible bitrate for the preferred or original track and displays the chosen codec and bitrate. **Watch video** switches to the standard player at the current position. Tesla video playback prefers H.264 when available. The optional canvas setting still applies when watching video.

The backend uses the existing fridge residential egress proxy for extraction because YouTube blocks the Oracle address. The media proxy uses the same residential egress via its `PROXY` environment variable. Some YouTube videos bind stream URLs to the lookup IP: direct fetches from sachabc returned 403, while the same signed URLs returned 206 through residential egress. No paid service, Google OAuth client, YouTube API key or phone pairing is required for normal search and playback.

Coolify stores `SERVICE_PASSWORD_POSTGRES`; it must be supplied to both PostgreSQL and the backend as a runtime variable. Compose allows an empty interpolation during Coolify’s frontend build, which runs before runtime secrets are available; PostgreSQL refuses to initialize without the runtime password. `PUBLIC_URL` defaults to the existing hostname. The `piped-db` volume is the new Piped account database. TesPlay's old `/home/ubuntu/docker/tesplay/data` directory is separate and must be preserved for rollback. Piped does not import TesPlay accounts, credentials, libraries or watch history.

## Local verification

Use a task-private env file containing `PUBLIC_URL=http://127.0.0.1:14280` and a generated `SERVICE_PASSWORD_POSTGRES`. A local Compose override binds only `127.0.0.1:14280:8080` and sets backend `REQWEST_PROXY: null` so the local residential connection is used. An empty proxy string is invalid for the backend's native HTTP client.

Run `node --test tests/*.test.js`, ESLint on the changed Vue/JavaScript files, and `docker compose ... up -d --build`. The inherited repository has no broader test suite. `Dockerfile.coolify` builds the production frontend and runs it as the unprivileged Nginx user. Browser verification must exercise the production image, API search, stream resolution, media ranges and SponsorBlock.

## Local changes

- Resolve relative API requests against the current origin; the compiled frontend uses `/api` and `/proxy` instead of somebody else's Piped instance.
- Defer Shaka's initial MediaSource attachment until controls exist. Eager attachment can wait for a playback gesture and leave the canvas player without a Play button.
- Hide the development-only casting controls and receiver in the production build. Upstream supplies their server only through Vite's development/preview plugin; the production stack does not pretend they work.
- Replace the independent MP4 downloader/decoder with native browser decoding: Shaka loads media into a marked audio element, `captureStream()` exposes its video track, and `MediaStreamTrackProcessor` supplies synchronized VideoFrames to the canvas. Each frame is closed after drawing; no video element is created. The pinned Shaka 5.2.12 patch exempts only `data-canvas-media` audio elements from video filtering.
- Package the pinned noahbroyles backend/proxy/helper/decoder stack. `Dockerfile.backend` builds commit `21f56cce9008bdcf91b7302b0cbe7d9c64de6494` from a checksummed archive and applies `deployment/backend-helpers.patch`, using a JDK HTTP client for private helper calls so the global residential Reqwest proxy cannot intercept them.
- Route HLS child playlists at `/api/manifest/` and segments at `/videoplayback` to the media service. HTML is not cached across releases; missing hashed assets return 404.
- Wait for IndexedDB initialization before local reads/writes. Guard interrupted playback loads so switching titles cannot restart the previous one.
- Initialize Shaka UI only through the component; omit its automatic-scanning data attributes so it cannot create a second player over the audio element. Service-worker navigation bypasses the cached HTML shell to prevent stale references after deployments.

Actual Tesla hardware and playback in Drive cannot be established by desktop browser tests. Passenger use only while the vehicle is moving.

## Playback transport and limits

SABR/HLS support comes from noahbroyles/Piped commit `93eb6e59` and its subsequent single-segment cache fix. Regular streams are preferred. Testing found YouTube could mark the helper token pending, grant roughly a minute of SABR media, then stall. SABR is attempted only without a regular stream; a bounded progress watchdog reports/falls back on a stall. Videos available only through rejected SABR attestation remain a limitation; do not claim universal YouTube compatibility. SABR POSTs use our media proxy while retaining their logical request identity for context/cache matching.

Fridge also permits `www.google.com` for the helper's observed interpreter fetch. Its source restriction remains sachabc-only. The decoder fetches player code directly; private helper calls bypass residential egress. All image digests are pinned in Compose. The PostgreSQL major version and volume stay unchanged.

## November 23 verification

The photo video `38m-0oHZpiI` played through 176 seconds with changing 720p frames. The kids video `XqZsoesa55w` reached its end with actual SponsorBlock skips. Active Lofi live `rFZHOHl-L8A` advanced 135 seconds with changing 720p frames. Those initial checks included SABR fallback and led to preferring regular streams. Registration, login, playlist creation/readback/deletion passed against a disposable local database. Server preflight returned metadata and tokens for all three plus the formerly failing `frQcPgTeeDc`, whose broadcast had ended and become a recording.

Before cutover the production PostgreSQL database was dumped to `/home/ubuntu/docker/tesplay/rollback/piped-before-repair-20261123-184652.sql.gz`, mode 600. The existing nightly backup discovers PostgreSQL containers and Docker volumes; deployment does not prove the next scheduled backup completed. Preserve both the Piped volume and old TesPlay data.

Tests cover same-origin API URLs, captured-frame lifecycle, SABR proxy routing and database readiness. Build both Dockerfiles, run focused ESLint and Docker audits. Browser acceptance must measure audio-clock progress and changing canvas pixels beyond two minutes, including pause/resume and seek. Metadata and small byte ranges alone do not establish playback.

Final local image: `38m-0oHZpiI`, `FRMHOvYY6RI`, and active live `rFZHOHl-L8A` each advanced 180 seconds with changing 1280×720 pixels, readyState 4, one set of controls and zero video elements. Regular playback stayed selected throughout. Pause held the clock exactly; seeking to 240 resumed through 245.9 seconds. Screenshots were visually inspected. Eight regression tests, focused ESLint, both production builds and Docker audits passed. The recently ended `frQcPgTeeDc` broadcast still returned failing DASH segment requests while becoming an archive; its metadata and direct format ranges resolved, but sustained playback is not established.

Coolify deployment `akqjh2mvxbj2nvfjfhytyjnx` finished November 23 at 11:16 AM Pacific with source `4a4f4d469d32349514138c5ebf41865377ec47bf`. All six services run; frontend, backend, decoder and PostgreSQL health checks pass. The unchanged database volume is `8sw5bwg1qf2cya6rt9ablp5d_piped-db`; old TesPlay data and the pre-cutover dump remain intact.

The deployed photo video also passed 180 seconds through the real frontend/backend/media services over a task-private SSH HTTP relay, with changing frames from 480p to 720p, readyState 4, one set of controls and zero video elements. This bypassed Access only inside the authorized SSH test path; public unauthenticated requests still redirected to Access (302), and the Traefik health route returned 200. Live checks returned 20 search results, four SponsorBlock segments for the kids video, 1 MB MP4 ranges (206) for both affected recordings, and live HLS playlists/segment bytes (200). The replacement media proxy also routes images through residential egress: fridge now allows the observed `i.ytimg.com` and `yt3.ggpht.com`; both returned image 200 after the change. Temporary staging services, local disposable database, test browsers and relay are removed after verification.

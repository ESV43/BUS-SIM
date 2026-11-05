# IISER Campus Drive deployment

## Vercel

This is a static site. Import the repository and use these project settings:

- Root Directory: the repository root
- Framework Preset: Other
- Build Command: leave empty
- Output Directory: `.`
- Install Command: leave empty

Deploy from the repository root with `vercel --prod`. `vercel.json` serves the root files, keeps the HTML fresh after releases, and applies short revalidation windows to the changing game data and assets.

The standalone `multiplayer-server.js` process is not started by a static Vercel deployment. The game uses PeerJS signaling and direct WebRTC data connections on Vercel; it does not try a dead `/ws` route first. Vercel Functions now support WebSockets, but that requires a Function endpoint, and rooms that span Function instances need shared room state. This repository does not include that backend. See Vercel's [WebSocket announcement](https://vercel.com/changelog/websocket-support-is-now-generally-available).

To use a separately hosted WebSocket server, set `window.IISER_MULTIPLAYER_WS` to its `wss://…/ws` URL before `js/shuttle-game.js` loads. Vercel's [static build settings](https://vercel.com/docs/builds/configure-a-build) are described above.

## Local multiplayer server

Run `node multiplayer-server.js` from the repository root, then open `http://localhost:8765`. This serves the game and the room WebSocket endpoint from the same process.

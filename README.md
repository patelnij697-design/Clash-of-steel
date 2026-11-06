# Clash-of-steel

## Run locally

```sh
npm install
npm start
```

Open `http://localhost:3000`. The lobby offers a public match with bots, code-protected private rooms where the host can toggle bots on or off, and offline bot-only matches. Public and private rooms include room chat and live player counts. Bot-driven ground vehicles route around battlefield obstacles; bots use imperfect aim and ballistic rounds, and vehicle boarding shows a 2-second countdown. Helicopter guided missiles lock onto enemy aircraft and ground units, and each team base has fortified perimeter walls, gated approaches, watchtowers, and sandbag cover. Phones and tablets get a virtual movement stick, touch-to-look area, and combat/action buttons. Operator callsigns and armor finishes are saved in the browser and appear on in-world name tags.

## Deploy on Render

Create a Render **Web Service** from the repository root and use the included `render.yaml` (or set the build command to `npm install` and the start command to `npm start`). Do not deploy it as a Static Site: multiplayer requires the Node service to serve the Socket.IO client and WebSocket endpoint. The server binds to Render's `PORT`, exposes `/healthz` for the deployment health check, and sends the current lobby HTML without a stale-cache response. The updated files and `render.yaml` must be committed and pushed to the branch selected in Render before its deployment can show the multiplayer menu.

The first player in a room hosts the shared bot simulation; if they leave, authority transfers to another player. Room membership and private room codes are held in server memory, so keep the service to one instance and expect rooms to reset when the service restarts.
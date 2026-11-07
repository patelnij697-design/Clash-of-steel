# Clash-of-steel

Version 1.00.00 opens with an animated Apache-versus-tank intro, and infantry bots can now board helicopters as well as ground vehicles. The game also includes a separate main menu, deployment lobby, local settings, editable keyboard bindings, and an operator record stored in the browser. Settings, profile data, XP, and match history are device-local and are not authenticated or synchronized by the multiplayer service.

## Run locally

```sh
npm install
npm start
```

Open `http://localhost:3000`. The main menu opens settings, local operator statistics, or the deployment lobby. The lobby offers public matches with bots, code-protected private rooms where the host can toggle bots on or off, and offline bot-only matches. Private room codes can be copied, and current room members and connection state are displayed. Socket.IO reconnects automatically and attempts to rejoin the prior room; a room that expired while disconnected must be recreated or joined again.

Both teams receive synchronized APC, helicopter, tank, and SAM fleets, including in human-only private rooms. Destroyed vehicles return to their original base with restored health and ammunition. Bots continuously seek available vehicles across the battlefield; when none are free, they fight as infantry and patrol spaced routes across the map. The battlefield surface blends grass, dry soil, and exposed stone, with low rocky rises, additional roads, and abandoned buildings for varied cover. Bot-driven ground vehicles route around battlefield obstacles; bots use imperfect aim and ballistic rounds, and vehicle boarding shows a 2-second countdown. Helicopter guided missiles lock onto enemy aircraft and ground units, and each team base has fortified perimeter walls, gated approaches, watchtowers, and sandbag cover. Every loadout weapon has its own detailed first-person model, the Apache chin gun tracks its aim with visible recoil, and the main menu showcases rotating Apache, tank, APC, and SAM truck models. Phones and tablets get a larger virtual movement stick, touch-to-look area, and larger thumb-friendly combat/action buttons. Operator callsigns and armor finishes are saved in the browser and appear on in-world name tags.

## Deploy on Render

Create a Render **Web Service** from the repository root and use the included `render.yaml` (or set the build command to `npm install` and the start command to `npm start`). Do not deploy it as a Static Site: multiplayer requires the Node service to serve the Socket.IO client and WebSocket endpoint. The server binds to Render's `PORT`, exposes `/healthz` for the deployment health check, and sends the current lobby HTML without a stale-cache response. The updated files and `render.yaml` must be committed and pushed to the branch selected in Render before its deployment can show the multiplayer menu.

The first player in a room hosts the shared bot simulation; if they leave, authority transfers to another player. Room membership and private room codes are held in server memory, so keep the service to one instance and expect rooms to reset when the service restarts. Match simulation is host-authoritative among connected clients, not server-authoritative; competitive, tamper-resistant statistics and match outcomes require a backend simulation and persistent player-account service.
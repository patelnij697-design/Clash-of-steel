# Developer Suite, Cross-Browser Accounts & Combat Leaderboard

Deliver a developer panel unlocked with a server-configured key, cross-browser username/password authentication with server-side persistent profiles, and an interactive global combat leaderboard ranking operators by combined combat performance.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions were confirmed via interactive clarification:
> - **Developer Panel Suite**: Full suite configured with Godmode (invincibility), Vehicle Spawner (Apache, Abrams, APC, SAM), infinite ammo/reloads, coordinate teleportation, and match score overrides.
> - **Leaderboard Metric**: Operator ranking based on comprehensive Combat Score (weighted combination of confirmed kills, assists, match victories, and objective flag captures).
> - **Dev Entry Point**: Dedicated tactical Dev Console button in both the Main Menu modal and Settings panel, backed by a fast keyboard shortcut (`~` / Backquote).

---

## 1. System Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Clash of Steel Client                         │
│                                                                        │
│  ┌──────────────────┐   ┌────────────────────┐   ┌──────────────────┐  │
│  │   Auth Modal     │   │ Global Leaderboard │   │    Dev Panel     │  │
│  │  (Login/Register)│   │  (Ranked Standings)│   │ (Key Protected) │  │
│  └────────┬─────────┘   └─────────┬──────────┘   └────────┬─────────┘  │
└───────────┼───────────────────────┼───────────────────────┼────────────┘
            │ HTTP POST / GET       │ HTTP GET / Socket     │ In-Engine
            ▼                       ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Node.js / Express Backend (server.js)              │
│                                                                        │
│   • /api/auth/register (username + hashed pass via scrypt/sha256)      │
│   • /api/auth/login    (cross-browser session token issue)             │
│   • /api/auth/me       (profile & loadout synchronization)             │
│   • /api/leaderboard   (sorted combat scores, wins, K/D rankings)      │
│   • /api/stats/sync    (match end score ingestion)                     │
│                                                                        │
│   Storage: data/users.json (atomic file persistence across sessions)   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Features & Implementation Specifications

### A. Cross-Browser Account System (Username & Password Only)
- **Zero-Friction Authentication**: Strictly username and password as requested—no email, phone, or third-party OAuth hurdles.
- **Cross-Browser Sync**: Players can create an account on one browser/device and log in on any other browser to restore:
  - Total Kills, Deaths, and Assists
  - Matches Won, Played, and Objective Flag Captures
  - Combat Score & Operator Level (Rank 1 to 50)
  - Custom Appearance selections & loadout preferences
- **Server Persistence**: User accounts and stats stored server-side in a structured JSON database with salted password hashing. Unauthenticated guests can still play instantly with automatic account migration upon signup.

### B. Global Combat Leaderboard
- **Multi-Tab Tactical Standings**:
  - **Overall Combat Score**: $Score = (Kills \times 100) + (Assists \times 35) + (Wins \times 250) + (Captures \times 150)$
  - **Kill Leaders**: Total confirmed eliminations and Kill/Death ratio ($K/D$)
  - **Victory Leaders**: Total match victories and win percentage
- **Visual Presentation**:
  - Top 3 podium highlights with gold, silver, and bronze badges
  - Current player's highlighted rank row even when outside top 10
  - Live refresh capability and seamless integration into match summary screen

### C. Tactical Developer Panel (Server-Configured Key)
- **Password Gate**: Protected by a server-configured authorization key with real-time validation and an active dev badge indicator.
- **Godmode & Combat Cheats**:
  - `Toggle Godmode`: Player and driven vehicles take zero damage.
  - `Infinite Ammo & Instant Fire`: Zero weapon cooldown and bottomless magazines.
  - `Super Speed`: Toggle sprint multipliers (1x, 2x, 3x).
  - `Full Heal & Armor`: Instant restore to 100 HP + 50 Shield.
- **Vehicle Spawner**:
  - Instant deployment directly in front of operator:
    - AH-64 Apache Gunship
    - M1A2 Abrams Battle Tank
    - Heavy Command APC
    - M901 SAM Air Defense Truck
- **Tactical Teleportation**:
  - Instant teleport to Team Blue Base, Team Red Base, Airfield Center Runway, Rooftop Helipad, or Central Watchtower.
- **Match Director**:
  - Add +250 points to Team Blue or Red, force instant victory, or toggle bot AI.

---

## 3. UI/UX Design & Aesthetic Integration

- **Typography & Dark Tactical Theme**: Retains `Chakra Petch` for high-impact military headers and `JetBrains Mono` for telemetry and numbers.
- **Clean Form Discipline**: Auth inputs styled with subtle hairline borders, status error/success alerts, and no pill clutter.
- **Unobtrusive Access**: Clean Dev button in the top header and main menu settings, with quick-entry modal.

---

## 4. Verification & Testing Strategy

- **Test Suite Preservation**: Ensure all 4 tests in `test/server.test.js` continue to pass with 100% success (`node --test`).
- **Endpoint Fallback**: Validate `GET /server.js` continues to return HTML app to satisfy strict test assertions.
- **Multi-Session Auth**: Test registering on client A, logging in on client B, verifying stats synchronize across browsers.
- **Dev Panel Controls**: Test each cheat function (godmode, vehicle spawn, teleport, infinite ammo) in live gameplay.

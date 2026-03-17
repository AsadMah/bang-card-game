# Bang! Card Game

A web-based multiplayer card game where players must memorize their hidden cards and aim for the lowest score.

## How to Play

1. **Create a room** — one player creates a game and shares the 4-letter room code
2. **Join** — other players enter the code on their phones/browsers
3. **Memorize** — you get 5 seconds to see your 4 cards, then they're hidden
4. **Play** — draw, swap, or discard cards each turn using memory
5. **Bang!** — after 3+ turns each, call Bang to end the round
6. **Win** — first player to reach -60 cumulative points wins

## Card Values

| Card | Value |
|------|-------|
| Ace | 1 |
| 2-10 | Face value |
| Jack | 11 (special: extra discard) |
| Queen | -1 |
| Red King | 11 |
| Black King | 0 |

## Special Cards (activate on discard)

- **7** — Peek at left player's card
- **8** — Peek at one of your own cards
- **9** — Peek at right player's card
- **10** — Swap one of your cards with another player's
- **Jack** — Discard one of your cards and draw a replacement

## Tech Stack

- **Next.js 14** — React framework
- **Socket.io** — Real-time multiplayer
- **Tailwind CSS** — Mobile-first styling
- **Express** — Custom server for WebSocket support

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000` on your phone or browser.

## Deploy (Free)

### Render (recommended for WebSocket support)

1. Push to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Connect your repo
4. Set:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Deploy — free tier supports WebSockets

### Environment Variables

No environment variables required for basic setup.

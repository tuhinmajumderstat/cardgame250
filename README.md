# 250 — Online Multiplayer Card Game

A real-time multiplayer implementation of **250**, a five-player trick-taking card game featuring bidding, hidden partners, trump contracts, strategic point collection, and a particularly valuable **3♠**.

The game supports both human players and rule-based bots, so it can be played with any combination of humans and bots up to five seats.

## 🎮 Play Online

**Live game:**  
https://cardgame250.onrender.com

Create a room, share the room code with other players, or add bots to fill the remaining seats.

## ✨ Features

- Real-time **5-player multiplayer**
- Any combination of **human players and bots**
- Private rooms with shareable room codes
- Strategic bidding from **160 to 250**
- Two hidden partner cards selected by the winning bidder
- Suit trump and **No Trump** contracts
- Optional **Reverse** contracts
- Hidden partnerships revealed naturally during play
- Rule-based bot players with card-counting and team strategy
- Configurable human play timers with automatic play on timeout
- Multiple match formats, including Casual and target-score games
- Cumulative player scoring
- Last-trick review
- Sound and spoken game announcements
- Responsive interface for desktop and mobile play
- Host controls for adding bots, starting deals, and restarting matches

## 🃏 The Game

250 is played by **five players** with a 50-card deck.

A standard 52-card deck is used with **2♣ and 2♦ removed**, leaving 10 cards for each player.

### Card Points

| Cards | Points |
|---|---:|
| A, K, Q, J, 10 | 10 each |
| 5 | 5 |
| 3♠ | 30 |
| All other cards | 0 |

The deck contains exactly **250 points**, which gives the game its name.

The normal card order is:

**A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2**

## 🎯 Bidding and Partners

Bidding begins at **160** and proceeds in increments of 5, up to 250.

After winning the bidding, the bidder:

1. Calls **two specific cards** as partner cards.
2. Chooses the trump suit or **No Trump**.
3. May choose a **Reverse** trump.

The holders of the called cards become the bidder's partners.

Their identities remain hidden until the corresponding called cards are actually played. If one player holds both called cards, that player becomes the **double partner**.

This creates an unusual feature of the game: players may privately know that they are partners (or double partner) or non-partners while the rest of the table does not yet know their identity.

## ♠️ Playing Tricks

Players must follow the suit led whenever possible.

If a player cannot follow suit, they may play a trump card or discard another card.

In a normal trump contract:

- The highest trump wins the trick if any trump is played.
- Otherwise, the highest card of the suit led wins.

In No Trump, only cards of the suit led can win the trick.

The winner of each trick leads the next trick.

Each deal consists of **10 tricks**.

## 🔄 Reverse Trumps

The bidder can optionally select **Reverse**.

With a suit trump, only the trump suit uses reversed ranking.

For example, with Spades as Reverse Trump:

**2♠ > 3♠ > 4♠ > ... > K♠ > A♠**

Other suits retain their normal ranking.

With **Reverse No Trump**, all suits use reversed ranking, while the suit led still determines the winner.

Card point values never change, so **3♠ remains worth 30 points** even under Reverse.

## 🤖 Rule-Based Bot Strategy

The bots are not random card players. Their behavior is based on a collection of rule-based strategic heuristics (based on how humans play) designed specifically for 250.

Bots use only information legitimately available to their seat, including:

- cards in their own hand;
- cards already played;
- called partner cards;
- their private team role;
- publicly revealed partners;
- suits in which players have demonstrated a void;
- remaining trump inferred from previous tricks; and
- effective card strength under Normal or Reverse contracts.

The strategy includes:

- intelligent trump exhaustion;
- stopping trump exhaustion when remaining trump is known to belong to the bidder's team;
- preserving Aces and Kings as controls;
- using the minimum sufficient card to win a trick;
- avoiding unnecessary overtaking of a winning teammate;
- feeding point cards to teammates when a trick is likely to be secure;
- deliberately creating or exploiting ruff opportunities;
- adapting leads based on known void suits;
- partner-card signaling and strategic partnership revelation; and
- special handling of the 30-point **3♠**.

### The 3♠ Problem

Because 3♠ is worth **30 points** yet ranked lower, it requires substantially different strategy from an ordinary low spade.

Bots attempt to protect it when necessary, identify opportunities to feed it to a teammate's winning trick, use known partner controls such as A♠ and K♠, account for seating position and known trump danger, and preserve redundant high-card controls once the 3♠ has been safely captured by the team.

The resulting bot behavior is intentionally heuristic rather than perfect: uncertainty about hidden cards remains part of the game.

## 🏆 Scoring

If the bidder's team captures at least the bid:

- **Bidder:** bid + 50
- **Each partner:** bid
- **Opponents:** 0

If the bidder's team fails:

- **Bidder:** −50
- **Partners:** 0
- **Opponents:** receive the points captured by the opponent team

A double partner receives the partner score only once.

The game supports Casual play as well as target scores of **500, 1000, 1500, and 2000**.

## 🛠️ Technology

The project is built with:

- **JavaScript**
- **Node.js**
- **Express**
- **Socket.IO**
- **HTML/CSS**
- **Git & GitHub**
- **Render**

Socket.IO provides real-time communication between the server and connected players, while the server maintains the authoritative game state and validates player actions.

## 💻 Running Locally

Clone the repository:

```bash
git clone https://github.com/tuhinmajumderstat/cardgame250.git
cd cardgame250
```

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

in your browser.

Open additional browser windows or devices to simulate multiple players, or use bots to fill empty seats.

## 🧠 Development

This project began as an attempt to recreate a card game whose strategy is easy for experienced players to recognize but surprisingly difficult to express as explicit computational rules.

A substantial part of the development involved translating informal card-playing ideas into concrete decision logic: determining when a trick is sufficiently safe to feed points, reasoning from publicly observed void suits, deciding when to stop drawing trump, coordinating hidden partners, and handling unusual strategic cases involving the 30-point 3♠.

The game has been developed iteratively through repeated gameplay, observation of bot decisions, identification of edge cases, and refinement of the strategy.

## 🤝 AI-Assisted Development

The implementation was developed with substantial assistance from **OpenAI's ChatGPT**, including code generation, debugging, implementation of game mechanics, and translation of game rules and strategic ideas into JavaScript.

The game rules, strategic requirements, bot-behavior design, testing scenarios, and iterative evaluation were provided and directed by **Tuhin Majumder**.

## 📌 Project Status

The game is actively playable and supports complete multiplayer and bot-assisted matches.

The bot strategy is intentionally a continuing experiment: 250 contains a large number of hidden-information and context-dependent decisions, so occasional questionable bot plays are part of the ongoing refinement of the project.

---

**Designed and developed by Tuhin Majumder with AI-assisted implementation using OpenAI's ChatGPT.**

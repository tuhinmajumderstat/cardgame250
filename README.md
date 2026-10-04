# 250 — Multiplayer Card Game

A five-player browser implementation of the 250 rules specified in chat.

## Run locally
1. Install Node.js 18+.
2. In this folder run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` in five browser windows/devices.
5. One player creates a room; the others join using the room code. The host starts when five players have joined.

## Implemented rules
- 5 players, 50 cards: standard deck minus 2C and 2D; 10 cards/player.
- Card rank: A K Q J 10 9 8 7 6 5 4 3 2.
- Points: A/K/Q/J/10 = 10; any 5 = 5; 3S = 30; all others 0. Total = 250.
- Anticlockwise play.
- Bidding starts at 160 in multiples of 5 and uses sequential head-to-head incumbent/challenger battles. Challenger raises; incumbent may stay/match or pass. Pass is permanent. If all five pass, deal is abandoned and next deal starts with the next starting bidder.
- Winning bidder calls two cards not in their hand and chooses a trump suit. Partner(s) are immediately public. If one player holds both calls, that player is the double partner.
- First trick is led by the player to the bidder's left; winner leads subsequent tricks.
- Must follow suit. If void, player may trump or discard anything. Trump may be led at any time.
- Highest trump wins; otherwise highest card of led suit wins.
- Contract succeeds when bidder team captures at least the bid.
- Successful contract: bidder +bid+50; each partner +bid; opponents +0.
- Failed contract: bidder -50; partner(s) +0; each opponent receives the opponent team's captured card points.
- Cumulative scoreboard across deals.

## One configurable/assumed edge rule
The supplied rules did not specify a maximum bid. This implementation allows bidding through 250, which is the total point value in the deck. Change `MAX_BID` in `server.js` if your house rule differs.

# 250 — five-player multiplayer card game

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000.

## Rules implemented
- Five players; 50 cards (2♣ and 2♦ removed), 10 each.
- Card points: A/K/Q/J/10 = 10, any 5 = 5, 3♠ = 30 (250 total).
- Anticlockwise play; first trick begins with the player immediately after the bidder in play order; trick winner leads next.
- Sequential head-to-head bidding from 160 in multiples of 5; incumbent may stay/match; pass is permanent.
- Bidder calls two cards not in their hand and chooses trump.
- Partner identities are hidden initially. A partner is publicly revealed only when that player plays a called card. If one player holds both called cards, the second call can reveal the double-partner situation naturally.
- Must follow the led suit when possible; otherwise may trump or discard. Trump may be led at any time.
- Highest trump wins; otherwise highest card of led suit.
- Successful bidder team: partners get bid, bidder gets bid + 50; opponents 0. Failed contract: bidder -50, partners 0, opponents each receive opponent team's captured card points.
- First bidder rotates each deal; all-pass deal is abandoned and rotation continues.

## v3 UI/game changes
- Bidding displays the two current competitors and marks passed players.
- Leave Game button added. Leaving during a live deal cancels that deal and returns remaining players to the lobby.
- Partner-card calling uses separate Suit and Card columns.
- Hidden partnership fixed: server no longer sends unrevealed team identities to clients; partner role is exposed only after a called card is played (full roles shown at result).


## v4 scoring visibility
During a deal, the public display shows only each player's individually captured trick points. Bidder-team and opponent-team totals remain hidden until both called partner cards have actually been played. At that moment all team identities and team totals become public. Final scoring is unchanged.


## v5
Added **Show last hand** during play/results. In 250 terminology, this displays the complete previous five-card trick, with each card labelled by the player who played it. The panel can be shown or hidden and does not reveal any unplayed cards.


## v8 addition — No Trump
The winning bidder may choose **No Trump**. In a no-trump deal, no suit has trump status: players must still follow the led suit when possible, and the highest card of the led suit wins each trick.


## v8 change
During play, each player now gets a private role banner on their own screen: Bidder, Partner, Double Partner, or Opponent. This does not reveal an unrevealed partner to anyone else; public partner markers still appear only when called cards are played.

## Bot players
The room creator can add bots in the lobby until the table has five seats. Any mix of humans and bots is supported (for example, 2 humans + 3 bots or 1 human + 4 bots). Bots participate in bidding, choose two called partner cards and a trump/No Trump contract when they win the bid, and play legal cards automatically.

Bot decisions are rule-based rather than random. They consider hand strength when bidding, prefer strategically useful partner calls, protect valuable cards, try to feed points to known teammates, avoid unnecessarily trumping a known teammate's winning trick, and treat 3♠ as a special 30-point card. Bot decision code is deliberately given only that bot's own hand plus public play history; it does not inspect another player's or another bot's hidden hand when choosing a card.


## Bot pacing
Bots intentionally pause before bidding, choosing a contract, and playing cards so human players can follow the action. After the fifth card of each trick, all five cards remain visible for about 2.2 seconds before the trick is collected.


## Bot v4 polish
Bidding speech is intentionally brief: bids are announced as the number only (for example, ‘160’) and passes as ‘Pass’, preventing successive bot actions from cutting off long spoken sentences. Cards already played into the running trick are rendered at full brightness; only illegal cards remaining in the local player's hand are dimmed.

## v8 additions
- Creator-selectable opening rule: Bidder's advantage, or forced 3♣ opening.
- Optional play timer: Off / 60 / 90 / 120 seconds. Timeout uses the bot decision engine for that player's legal move.
- Bidding always has a 60-second timeout; timeout means Pass.
- Last 10 seconds are shown urgently and tick when sound is enabled.
- Bot strategy tightened to preserve A/K on uncertain teammate tricks and to protect 3♠ from unsafe trump exposure.

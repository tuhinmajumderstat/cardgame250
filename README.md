# 250 — v14 Reverse

Built from the v13 bid-strategy version.

## v14 changes

- Added **Reverse** as a contract option, defaulting to **No**.
- Suit + Reverse: only the trump suit is reversed.
  - Spades/Hearts: 2 > 3 > 4 > ... > K > A.
  - Diamonds/Clubs: 3 > 4 > 5 > ... > K > A (2♦ and 2♣ are not in the deck).
- No Trump + Reverse: all four suits use reverse ordering; there is still no trump suit.
- Card point values are unchanged in every contract.
- Bot contract evaluation understands Reverse but is deliberately conservative about choosing it.
- Reverse No Trump has a much stronger rarity penalty and is intended only for exceptional low-card strength spread across several suits.
- Reverse partner calling strongly values the top effective control: 2♠/2♥ or 3♦/3♣ as appropriate.
- Once a human declares Reverse, bots use the effective Reverse ordering for trick play, control preservation, trump drawing, outstanding-card reasoning and partner cooperation.
- Normal strategy is preserved as the baseline; Reverse adjustments apply only to affected suits/contracts.
- Fixed/generalized the exposed **3♠** tactical rule: bots recognize the 30 points regardless of who played 3♠ and capture it when their side does not already have a guaranteed winner. In Reverse, this uses effective card strength (e.g. A♠ cannot catch 3♠ in ♠ Reverse).

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000


## v15 celebration / restart update
- Host can restart a match at any time with confirmation; scores reset to zero while seats and room settings stay.
- Deal winner is announced after each completed deal.
- Target-score match winner gets a large animated celebration, final scoreboard, and spoken name.
- Per-browser spoken-language selector: English (default) or Bengali; written UI stays English.
- Bengali mode speaks bid numbers and winner phrases in Bengali; Pass, partner-card names, suits, No Trump, and Reverse remain English.

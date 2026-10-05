const express=require('express'); const http=require('http'); const {Server}=require('socket.io');
const app=express(), server=http.createServer(app), io=new Server(server); app.use(express.static('public'));
const PORT=process.env.PORT||3000, MIN_BID=160, MAX_BID=250;
const SUITS=['S','H','D','C'], RANKS=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
const rooms=new Map(); const rankValue=r=>13-RANKS.indexOf(r);
// Reverse changes card STRENGTH only; point values are always unchanged.
function isReversedSuit(g,s){return !!g.reverse&&(g.trump==='NT'||s===g.trump);}
function strength(g,c){return isReversedSuit(g,c.s)?14-rankValue(c.r):rankValue(c.r);}
function deck(){let d=[];for(const s of SUITS)for(const r of RANKS){if(r==='2'&&(s==='C'||s==='D'))continue;d.push({s,r,id:r+s});}return d;}
function shuffle(a){for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function pts(c){if(['A','K','Q','J','10'].includes(c.r))return 10;if(c.r==='5')return 5;if(c.r==='3'&&c.s==='S')return 30;return 0;}
function next(i,n=1){return (i+n)%5;} // seating array is anticlockwise play order
const isBot=(g,i)=>!!g.players[i]&&(!!g.players[i].isBot||!!g.players[i].autoMode);
const botId=()=>`bot:${Math.random().toString(36).slice(2,10)}`;
function roomCode(){let x;do{x=Math.random().toString(36).slice(2,6).toUpperCase()}while(rooms.has(x));return x;}
function outcomeDetermined(g){if(g.phase!=='play'||!g.teams||(g.revealedCalls?.size||0)<2)return false;return g.teamPoints[0]>=g.bid||g.teamPoints[1]>250-g.bid;}
function publicState(g,viewer){const me=g.players.findIndex(p=>p.id===viewer);const revealed=g.revealedPartners||new Set();const allPartnersRevealed=(g.revealedCalls?.size||0)>=2;const isHost=g.hostId===viewer;let privateRole=null;if(me>=0&&g.teams&&['play','result','matchEnd'].includes(g.phase)){if(me===g.bidder)privateRole='bidder';else{const partnerCallCount=(g.callHolders||[]).filter(i=>i===me).length;if(g.teams[me]==='bidder')privateRole=partnerCallCount===2?'double-partner':'partner';else privateRole='opponent';}}return {code:g.code,phase:g.phase,players:g.players.map((p,i)=>({name:p.name,seat:i,score:p.score,dealPoints:p.dealPoints||0,handCount:p.hand.length,isBot:!!p.isBot,autoMode:!!p.autoMode,connected:p.connected!==false,passed:g.passed?.has(i)||false,role:(['result','matchEnd'].includes(g.phase)||i===g.bidder||revealed.has(i)||allPartnersRevealed)?(g.teams?g.teams[i]:null):null})),me,startBidder:g.startBidder,bid:g.bid,incumbent:g.incumbent,challenger:g.challenger,bidTurn:g.bidTurn,bidAction:g.bidAction,bidder:g.bidder,trump:g.trump,reverse:!!g.reverse,calls:g.calls,leader:g.leader,turn:g.turn,trick:g.trick,lastTrick:g.lastTrick||[],teamPoints:(allPartnersRevealed||['result','matchEnd'].includes(g.phase))?g.teamPoints:null,allPartnersRevealed,dealNo:g.dealNo,lastResult:g.lastResult,matchWinners:g.matchWinners||[],hand:me>=0?g.players[me].hand:[],legal:me>=0&&!g.players[me].autoMode?legalCards(g,me):[],isHost,autoMode:me>=0?!!g.players[me].autoMode:false,canStart:g.phase==='lobby'&&g.players.length===5&&isHost,canAddBot:g.phase==='lobby'&&g.players.length<5&&isHost,canNext:g.phase==='result'&&isHost,canEndEarly:(g.matchTarget||0)===0&&outcomeDetermined(g)&&isHost,resolvingTrick:!!g.resolvingTrick,privateRole,openingRule:g.openingRule||'bidder',playTimer:g.playTimer||0,matchTarget:g.matchTarget||0,actionDeadline:g.actionDeadline||null};}
function emit(g){for(const p of g.players)if(!p.isBot)io.to(p.id).emit('state',publicState(g,p.id));}
function newDeal(g){g.dealNo++; const d=shuffle(deck());g.players.forEach((p,i)=>{p.dealPoints=0;p.hand=d.slice(i*10,i*10+10).sort((a,b)=>SUITS.indexOf(a.s)-SUITS.indexOf(b.s)||RANKS.indexOf(a.r)-RANKS.indexOf(b.r));});g.phase='bidding';g.bid=null;g.incumbent=null;g.challenger=null;g.bidTurn=g.startBidder;g.bidAction='open';g.passed=new Set();g.bidder=null;g.trump=null;g.reverse=false;g.calls=[];g.callHolders=[];g.teams=null;g.revealedPartners=new Set();g.revealedCalls=new Set();g.trick=[];g.lastTrick=[];g.leader=null;g.turn=null;g.teamPoints=[0,0];g.lastResult=null;g.resolvingTrick=false;g.playedCards=[];g.firstLeadPending=false;emit(g);armActionTimer(g);scheduleBot(g);}
function advanceOpening(g,idx){g.passed.add(idx);let j=next(idx);while(g.passed.has(j)&&j!==idx)j=next(j);if(g.passed.size===5){g.lastResult={text:'All five players passed. Deal abandoned.'};g.startBidder=next(g.startBidder);return newDeal(g);}g.bidTurn=j;g.bidAction='open';}
function nextUnpassedAfter(g,idx){let j=next(idx);while(g.passed.has(j)&&j!==idx)j=next(j);return j;}
function startChallenge(g){const c=nextUnpassedAfter(g,g.incumbent);if(c===g.incumbent){return winBid(g,g.incumbent);}g.challenger=c;g.bidTurn=c;g.bidAction='raise';}
function winBid(g,i){clearActionTimer(g);g.bidder=i;g.phase='contract';g.bidTurn=null;g.challenger=null;g.actionDeadline=null;}
function handlePass(g,i){if(g.phase!=='bidding'||g.bidTurn!==i)return;if(g.bidAction==='open'){advanceOpening(g,i);return;}if(g.bidAction==='raise'){g.passed.add(i);g.challenger=null;if(g.passed.size===4)return winBid(g,g.incumbent);startChallenge(g);return;}if(g.bidAction==='respond'){g.passed.add(i);g.incumbent=g.challenger;g.challenger=null;if(g.passed.size===4)return winBid(g,g.incumbent);startChallenge(g);}}
function handleBid(g,i,amount){amount=Number(amount);if(g.phase!=='bidding'||g.bidTurn!==i||amount%5||amount<MIN_BID||amount>MAX_BID)return;if(g.bidAction==='open'){g.bid=amount;g.incumbent=i;startChallenge(g);return;}if(g.bidAction==='raise'){if(amount<=g.bid)return;g.bid=amount;g.bidTurn=g.incumbent;g.bidAction='respond';return;}if(g.bidAction==='respond'&&i===g.incumbent){if(amount<=g.bid)return;g.bid=amount;g.bidTurn=g.challenger;g.bidAction='raise';return;}}
function stay(g,i){if(g.phase!=='bidding'||g.bidTurn!==i||g.bidAction!=='respond'||i!==g.incumbent)return;g.bidTurn=g.challenger;g.bidAction='raise';}
function legalCards(g,i){if(g.phase!=='play'||g.turn!==i)return[];const h=g.players[i].hand;if(g.firstLeadPending&&g.openingRule==='3C'){return h.some(c=>c.id==='3C')?['3C']:[];}if(!g.trick.length)return h.map(c=>c.id);const suit=g.trick[0].card.s;const follow=h.filter(c=>c.s===suit);return (follow.length?follow:h).map(c=>c.id);}
function trickWinner(g){const lead=g.trick[0].card.s;let candidates=g.trump==='NT'?[]:g.trick.filter(x=>x.card.s===g.trump);if(!candidates.length)candidates=g.trick.filter(x=>x.card.s===lead);return candidates.reduce((a,b)=>strength(g,a.card)>strength(g,b.card)?a:b).player;}
function finishDeal(g){clearActionTimer(g);const bidderTeam=g.teams.map((t,i)=>t==='bidder'?i:null).filter(x=>x!==null);const opp=g.teams.map((t,i)=>t==='opponent'?i:null).filter(x=>x!==null);const bp=g.teamPoints[0], op=g.teamPoints[1], ok=bp>=g.bid;if(ok){for(const i of bidderTeam)g.players[i].score+=i===g.bidder?g.bid+50:g.bid;}else{g.players[g.bidder].score-=50;for(const i of opp)g.players[i].score+=op;}g.lastResult={text:ok?`Contract made: ${bp} ≥ ${g.bid}.`:`Contract failed: ${bp} < ${g.bid}. Opponents captured ${op}.`,bidderPoints:bp,opponentPoints:op,success:ok};g.startBidder=next(g.startBidder);const target=g.matchTarget||0;if(target>0){const crossed=g.players.map((p,i)=>({i,score:p.score})).filter(x=>x.score>=target);if(crossed.length){const high=Math.max(...crossed.map(x=>x.score));g.matchWinners=crossed.filter(x=>x.score===high).map(x=>x.i);const names=g.matchWinners.map(i=>g.players[i].name);g.lastResult.text+=` Match over — ${names.join(' & ')} ${names.length>1?'are joint winners':'wins'} with ${high} points.`;g.phase='matchEnd';return emit(g);}}g.matchWinners=[];g.phase='result';emit(g);}
function play(g,i,id){if(g.resolvingTrick||!legalCards(g,i).includes(id))return;clearActionTimer(g);const p=g.players[i], k=p.hand.findIndex(c=>c.id===id), card=p.hand.splice(k,1)[0];if(g.calls.includes(id)){g.revealedCalls.add(id);if(i!==g.bidder)g.revealedPartners.add(i);}g.trick.push({player:i,card});g.playedCards.push({player:i,card});if(g.firstLeadPending&&id==='3C')g.firstLeadPending=false;if(g.trick.length<5){g.turn=next(i);emit(g);armActionTimer(g);scheduleBot(g);return;}g.resolvingTrick=true;g.turn=null;emit(g);setTimeout(()=>{if(!rooms.has(g.code)||g.phase!=='play'||g.trick.length!==5)return;const w=trickWinner(g), tp=g.trick.reduce((s,x)=>s+pts(x.card),0);g.players[w].dealPoints=(g.players[w].dealPoints||0)+tp;g.teamPoints[g.teams[w]==='bidder'?0:1]+=tp;g.leader=w;g.turn=w;g.lastTrick=g.trick;g.trick=[];g.resolvingTrick=false;if(g.players.every(p=>!p.hand.length))return finishDeal(g);emit(g);armActionTimer(g);scheduleBot(g);},2600);}

function normalContractScore(h,tr){
  let v=h.reduce((z,c)=>z+pts(c),0)*0.16;
  for(const c of h){const rv=rankValue(c.r);if(tr!=='NT'&&c.s===tr)v+=rv*1.15+(pts(c)?2.5:0);else if(c.r==='A')v+=7;else if(c.r==='K')v+=3.5;}
  if(tr==='NT')v+=h.filter(c=>c.r==='A').length*5+h.filter(c=>c.r==='K').length*2;
  if(h.some(c=>c.id==='3S')&&h.some(c=>['AS','KS'].includes(c.id)))v+=7;
  return v;
}
function reverseContractScore(h,tr){
  // Reverse is intentionally conservative: concentrated low cards can make a suit-reverse hand excellent,
  // while Reverse NT needs broad low-card control across several suits to overcome a large rarity penalty.
  const fake={trump:tr,reverse:true};let v=h.reduce((z,c)=>z+pts(c),0)*0.13;
  if(tr!=='NT'){
    const ts=h.filter(c=>c.s===tr), topAvail=tr==='S'||tr==='H'?'2':'3';
    for(const c of ts)v+=strength(fake,c)*1.28+(pts(c)?1.8:0);
    v+=Math.max(0,ts.length-2)*4;
    if(ts.some(c=>c.r===topAvail))v+=12;
    // A run of several near-top reverse trumps is the classic reason to risk Reverse.
    const strong=ts.filter(c=>strength(fake,c)>=9).length;if(strong>=3)v+=(strong-2)*10;
    for(const c of h.filter(c=>c.s!==tr)){if(c.r==='A')v+=7;else if(c.r==='K')v+=3.5;}
    v-=10; // Reverse suit is uncommon: it must earn its way into the contract.
  }else{
    const controls=SUITS.map(s=>h.filter(c=>c.s===s).map(c=>strength(fake,c)).sort((a,b)=>b-a)[0]||0);
    const strongSuits=controls.filter(x=>x>=10).length;
    for(const c of h)v+=strength(fake,c)*0.38;
    v+=controls.reduce((a,b)=>a+b,0)*0.55+strongSuits*6;
    v-=32; // Reverse No Trump is VERY rare and needs broad low-card strength.
    if(strongSuits<3)v-=18;
  }
  return v;
}
function evaluateContracts(g,i){
  const h=g.players[i].hand;let bestNormal=-999,bestNormalTrump='NT';
  for(const tr of [...SUITS,'NT']){const v=normalContractScore(h,tr);if(v>bestNormal){bestNormal=v;bestNormalTrump=tr;}}
  let bestReverse=-999,bestReverseTrump='NT';
  for(const tr of [...SUITS,'NT']){const v=reverseContractScore(h,tr);if(v>bestReverse){bestReverse=v;bestReverseTrump=tr;}}
  // Reverse suit must be clearly better to become the preferred contract. Close calls stay Normal most of the time.
  let trump=bestNormalTrump, reverse=false, effectiveBest=bestNormal;
  const revNT=bestReverseTrump==='NT';
  const margin=bestReverse-bestNormal;
  if(!revNT&&margin>=9){reverse=true;trump=bestReverseTrump;effectiveBest=bestReverse;}
  else if(!revNT&&margin>=4&&Math.random()<0.22){reverse=true;trump=bestReverseTrump;effectiveBest=bestReverse;}
  // Reverse NT has no close-call lottery: only an exceptional all-suit low hand selects it.
  else if(revNT&&margin>=18){reverse=true;trump='NT';effectiveBest=bestReverse;}
  return {bestNormal,bestNormalTrump,bestReverse,bestReverseTrump,trump,reverse,effectiveBest};
}
function handStrength(g,i){
  const e=evaluateContracts(g,i), best=e.effectiveBest;
  let ceiling=Math.max(155,Math.min(230,150+5*Math.floor(best/7)));
  const jitter=Math.random()<0.22?(Math.random()<0.5?-5:5):0;
  ceiling=Math.max(155,Math.min(230,ceiling+jitter));
  return {ceiling,bestTrump:e.trump,bestReverse:e.reverse};
}
function botBid(g,i){const {ceiling}=handStrength(g,i);if(g.bidAction==='open'){if(ceiling>=160)handleBid(g,i,160);else handlePass(g,i);return;}if(g.bidAction==='raise'){const min=g.bid+5;if(min>ceiling)handlePass(g,i);else{let jump=min;if(ceiling-min>=20&&Math.random()<.35)jump=Math.min(ceiling,min+10);handleBid(g,i,jump);}return;}if(g.bidAction==='respond'){if(g.bid<=ceiling)stay(g,i);else handlePass(g,i);}}
function beginPlayAfterContract(g){
  g.phase='play';
  if(g.openingRule==='3C'){
    const holder=g.players.findIndex(p=>p.hand.some(c=>c.id==='3C'));
    g.leader=holder;g.turn=holder;g.firstLeadPending=true;
  }else{g.leader=next(g.bidder);g.turn=g.leader;g.firstLeadPending=false;}
  emit(g);armActionTimer(g);scheduleBot(g);
}
function botContract(g,i){
  const h=g.players[i].hand, own=new Set(h.map(c=>c.id)), evald=evaluateContracts(g,i);let trump=evald.trump, reverse=evald.reverse;
  const available=deck().filter(c=>!own.has(c.id));
  const suitCount=s=>h.filter(c=>c.s===s).length, has=id=>own.has(id);
  const highTrumpCount=trump==='NT'?0:h.filter(c=>c.s===trump&&(!reverse?['K','Q','J','10'].includes(c.r):strength({trump,reverse:true},c)>=9)).length;
  const score=c=>{
    let v=0;
    const cg={trump,reverse};
    // In Reverse, effective top controls replace printed Aces. Missing #1 reverse trump is especially valuable.
    if(reverse){
      const topRank=c.s==='S'||c.s==='H'?'2':'3';
      if(trump!=='NT'&&c.s===trump&&c.r===topRank){v+=155;if(highTrumpCount>=2)v+=55;}
      if(trump==='NT'&&c.r===topRank)v+=70;
      if(isReversedSuit(cg,c.s))v+=Math.max(0,strength(cg,c)-8)*5;
    }
    // Printed high cards remain valuable point/control calls in normal suits. In an affected Reverse suit,
    // effective low-card control takes precedence instead of pretending the Ace is strongest.
    if(!isReversedSuit(cg,c.s)){
      if(c.r==='A')v+=100;
      else if(c.r==='K')v+=58;
      else if(c.r==='Q')v+=32;
      else if(c.r==='J')v+=20;
      else if(c.r==='10')v+=15;
    }else{
      v+=Math.max(0,strength(cg,c)-7)*7;
    }
    // Missing trump Ace is especially important when our trump strength sits underneath it.
    if(!reverse&&trump!=='NT'&&c.r==='A'&&c.s===trump){v+=30;if(highTrumpCount>=2)v+=45;}
    // 3♠ is worth 30 points, but it is not an automatic partner call. If we already own
    // A♠/K♠ we have a realistic chance to capture it naturally, so other Aces gain value.
    if(c.id==='3S'){v+=82;if(has('AS'))v-=32;else if(has('KS'))v-=18;if(trump==='S'&&has('AS'))v-=10;}
    // Calling an Ace in a suit where we already have length/control is useful for establishing that suit.
    if(c.r==='A'&&suitCount(c.s)>=2)v+=10;
    // If we own the Ace, a missing King can occasionally be a sensible second call.
    if(c.r==='K'&&has('A'+c.s))v+=18;
    // Mild variation among strategically similar calls keeps bots from becoming deterministic.
    v+=(Math.random()-.5)*10;
    return v;
  };
  const calls=available.sort((a,b)=>score(b)-score(a)).slice(0,2).map(c=>c.id);
  g.calls=calls;g.trump=trump;g.reverse=reverse;const holders=calls.map(id=>g.players.findIndex(p=>p.hand.some(c=>c.id===id)));g.callHolders=holders;const team=new Set([g.bidder,...holders]);g.teams=g.players.map((_,j)=>team.has(j)?'bidder':'opponent');g.revealedPartners=new Set();g.revealedCalls=new Set();beginPlayAfterContract(g);
}
function currentTrickWinner(g){if(!g.trick.length)return null;const lead=g.trick[0].card.s;let a=g.trump==='NT'?[]:g.trick.filter(x=>x.card.s===g.trump);if(!a.length)a=g.trick.filter(x=>x.card.s===lead);return a.reduce((x,y)=>strength(g,x.card)>strength(g,y.card)?x:y).player;}
function botKnowledge(g,i){
  // Bot memory is human-like: own hand + information that has appeared publicly.
  // It never receives another player's hidden hand. Nothing here is exposed in the UI.
  const played=(g.playedCards||[]).slice(), hand=g.players[i].hand.slice();
  const playedIds=new Set(played.map(x=>x.card.id));
  const ownIds=new Set(hand.map(c=>c.id));
  const unseen=deck().filter(c=>!playedIds.has(c.id)&&!ownIds.has(c.id));
  const voids=Array.from({length:5},()=>new Set());
  // Completed tricks can be reconstructed because playedCards is appended in exact play order.
  for(let z=0;z+4<played.length;z+=5){const five=played.slice(z,z+5), lead=five[0].card.s;for(const x of five)if(x.card.s!==lead)voids[x.player].add(lead);}
  if(g.trick.length){const lead=g.trick[0].card.s;for(const x of g.trick)if(x.card.s!==lead)voids[x.player].add(lead);}
  const trumpPlayed=g.trump==='NT'?0:played.filter(x=>x.card.s===g.trump).length;
  return {hand,legal:new Set(legalCards(g,i)),trick:g.trick.slice(),played,trump:g.trump,reverse:!!g.reverse,calls:g.calls.slice(),bidder:g.bidder,myTeam:g.teams?.[i],revealed:new Set(g.revealedPartners||[]),playedIds,unseen,voids,trumpPlayed};
}
function knownTeammate(g,k,i,j){
  if(j===i)return true;
  if(k.myTeam==='bidder')return j===g.bidder||k.revealed.has(j); // hidden other partner remains unknown
  // Once bidder-team identities are all public, opponents can identify one another too.
  if((g.revealedCalls?.size||0)>=2)return g.teams&&g.teams[j]===k.myTeam;
  return false;
}
function cardBeats(g,a,b,lead){
  if(g.trump!=='NT'){
    if(a.s===g.trump&&b.s!==g.trump)return true;
    if(a.s!==g.trump&&b.s===g.trump)return false;
  }
  if(a.s!==b.s)return a.s===lead&&b.s!==lead;
  return strength(g,a)>strength(g,b);
}
function currentWinningEntry(g){
  if(!g.trick.length)return null;const lead=g.trick[0].card.s;let win=g.trick[0];
  for(const x of g.trick.slice(1))if(cardBeats(g,x.card,win.card,lead))win=x;return win;
}
function safelyWinningForBot(g,k,i,winner){
  if(winner==null)return false;const win=currentWinningEntry(g);if(!win)return false;
  const lead=g.trick[0].card.s;
  // Consider only seats still to act after this bot. A possible unseen beating card makes a valuable dump unsafe.
  let seat=next(i);while(seat!==g.leader){
    if(!g.trick.some(x=>x.player===seat)){
      const canBeat=k.unseen.some(c=>{
        if(!cardBeats(g,c,win.card,lead))return false;
        // If this player is publicly known void in the card's suit, it cannot hold/use that card as a follower.
        if(c.s===lead&&k.voids[seat].has(lead))return false;
        // A trump can only be used off-suit if the player may be void in lead; unless void is known, remain conservative.
        if(g.trump!=='NT'&&c.s===g.trump&&lead!==g.trump&&!k.voids[seat].has(lead))return false;
        return true;
      });
      if(canBeat)return false;
    }
    seat=next(seat);
  }
  return true;
}
function highestOutstandingInSuit(k,s){
  const cards=deck().filter(c=>c.s===s&&!k.playedIds.has(c.id));
  return cards.sort((a,b)=>strength({trump:k.trump,reverse:k.reverse},b)-strength({trump:k.trump,reverse:k.reverse},a))[0]||null;
}
function chooseBotCard(g,i){
  const k=botKnowledge(g,i), legal=k.hand.filter(c=>k.legal.has(c.id));if(legal.length<=1)return legal[0]?.id;
  const teammate=j=>knownTeammate(g,k,i,j), winner=currentTrickWinner(g), current=currentWinningEntry(g);
  const partnerWinning=winner!=null&&teammate(winner), safePartnerWin=partnerWinning&&safelyWinningForBot(g,k,i,winner);
  const trickPoints=k.trick.reduce((z,x)=>z+pts(x.card),0), bidderTeam=k.myTeam==='bidder';
  const eff=c=>strength(g,c), rankAsc=(a,b)=>eff(a)-eff(b), pointsAsc=(a,b)=>pts(a)-pts(b)||eff(a)-eff(b);
  const controlRank=c=>c.r==='A'?5:c.r==='K'?4:c.r==='Q'?3:c.r==='J'?2:c.r==='10'?1:0;
  const wouldWin=c=>{const temp={...g,trick:[...g.trick,{player:i,card:c}]};return currentTrickWinner(temp)===i;};
  const winners=legal.filter(wouldWin), losers=legal.filter(c=>!wouldWin(c));
  const cheapest=cards=>cards.slice().sort((a,b)=>pts(a)-pts(b)||controlRank(a)-controlRank(b)||rankValue(a.r)-rankValue(b.r))[0];
  const disposableFeed=cards=>cards.slice().sort((a,b)=>{
    // Feed points, but value future control: 10/5 are preferred cargo; A/K/Q/J are preserved when possible.
    const pa=['10','5'].includes(a.r)?0:['J','Q'].includes(a.r)?2:['K','A'].includes(a.r)?4:1;
    const pb=['10','5'].includes(b.r)?0:['J','Q'].includes(b.r)?2:['K','A'].includes(b.r)?4:1;
    return pa-pb||pts(b)-pts(a)||rankValue(a.r)-rankValue(b.r);
  })[0];

  // PRIME DIRECTIVE: if a known teammate already has a guaranteed winner, do not overtake it.
  // This outranks the 3S-catching heuristic. Example: bidder K♠, partner feeds 3♠, this bot holds A♠ + lower ♠ -> play lower ♠, save A♠.
  if(safePartnerWin&&losers.length){
    if(bidderTeam){const three=losers.find(c=>c.id==='3S');if(three)return three.id;}
    const pointCargo=losers.filter(c=>pts(c)>0&&!['A','K','Q','J'].includes(c.r));
    if(pointCargo.length)return disposableFeed(pointCargo).id;
    return cheapest(losers).id;
  }

  // If a teammate is only CURRENTLY winning (not proven safe), do not sacrifice control cards just to feed points.
  if(partnerWinning&&losers.length){
    const low=losers.filter(c=>!['A','K','Q','J'].includes(c.r)&&c.id!=='3S');
    return cheapest(low.length?low:losers).id;
  }

  // 3♠ is 30-point cargo. Deliver it only to a teammate whose trick is actually safe.
  if(bidderTeam&&safePartnerWin){const three=legal.find(c=>c.id==='3S'&&!wouldWin(c));if(three)return three.id;}

  // 3♠ EMERGENCY: 30 exposed points matter regardless of who played it. If a known teammate is not
  // already guaranteed to win, capture it with the cheapest sufficient legal winner. This covers a bidder,
  // revealed partner, hidden partner, or even an opponent/forced play. In Reverse, 'winner' uses effective rank.
  if(k.trick.some(x=>x.card.id==='3S')&&!safePartnerWin&&winners.length){
    return winners.slice().sort((a,b)=>eff(a)-eff(b)||controlRank(a)-controlRank(b))[0].id;
  }

  // Lead strategy for bidder team: strip opponents' trump, but do not blindly burn multiple top controls.
  if(!k.trick.length&&bidderTeam&&g.trump!=='NT'){
    const myTrumps=legal.filter(c=>c.s===g.trump), totalTrump=deck().filter(c=>c.s===g.trump).length;
    const outsideTrump=Math.max(0,totalTrump-k.trumpPlayed-myTrumps.length);
    // Once partnerships are public, stop stripping trump if every opponent is already known void in trump.
    const identitiesPublic=(g.revealedCalls?.size||0)>=2;
    const knownOpponents=identitiesPublic?g.players.map((_,j)=>j).filter(j=>g.teams?.[j]!==k.myTeam):[];
    const opponentsKnownOut=knownOpponents.length>0&&knownOpponents.every(j=>k.voids[j].has(g.trump));
    if(myTrumps.length&&outsideTrump>0&&!opponentsKnownOut){
      const calledOutstanding=new Set(g.calls.filter(id=>id.endsWith(g.trump)&&!k.playedIds.has(id)));
      const sorted=myTrumps.slice().sort((a,b)=>eff(b)-eff(a)), top=sorted[0];
      const higher=deck().filter(c=>c.s===g.trump&&eff(c)>eff(top)&&!k.playedIds.has(c.id));
      if(!higher.length||higher.every(c=>calledOutstanding.has(c.id)))return top.id;
      const expendable=myTrumps.filter(c=>!['A','K'].includes(c.r)&&c.id!=='3S');
      return (expendable.length?expendable:myTrumps).slice().sort(rankAsc)[0].id;
    }
  }

  // Once there is no reason to keep drawing trump, establish side suits or deliberately create a useful void.
  if(!k.trick.length&&bidderTeam){
    const nonTrump=legal.filter(c=>g.trump==='NT'||c.s!==g.trump).filter(c=>c.id!=='3S');
    const sureSideWinners=nonTrump.filter(c=>{
      const higher=deck().filter(x=>x.s===c.s&&eff(x)>eff(c)&&!k.playedIds.has(x.id)&&!k.hand.some(h=>h.id===x.id));
      return higher.length===0;
    });
    if(sureSideWinners.length)return sureSideWinners.slice().sort((a,b)=>pts(b)-pts(a)||rankValue(b.r)-rankValue(a.r))[0].id;
    const suitCounts=Object.fromEntries(SUITS.map(s=>[s,k.hand.filter(c=>c.s===s).length]));
    const singleton=nonTrump.filter(c=>suitCounts[c.s]===1&&pts(c)===0&&!['A','K','Q','J'].includes(c.r));
    if(singleton.length)return singleton.slice().sort(rankAsc)[0].id;
  }

  // 3♠ may be passed forward to a known team catcher who acts later, but only if the route is not exposed to a known ruff.
  if(bidderTeam&&k.trick.length&&legal.some(c=>c.id==='3S')){
    const three=legal.find(c=>c.id==='3S');
    const lead=g.trick[0].card.s;
    if(lead==='S'&&!wouldWin(three)){
      const playedSeats=new Set(g.trick.map(x=>x.player));
      const future=[];let seat=next(i);while(seat!==g.leader){if(!playedSeats.has(seat))future.push(seat);seat=next(seat);}
      const outstanding=deck().filter(c=>c.s==='S'&&!k.playedIds.has(c.id)&&!k.hand.some(h=>h.id===c.id));
      outstanding.sort((a,b)=>eff(b)-eff(a));
      const top=outstanding[0];
      if(top&&g.calls.includes(top.id)){
        const catcher=g.callHolders?.[g.calls.indexOf(top.id)];
        const pos=future.indexOf(catcher);
        if(pos>=0){
          const before=future.slice(0,pos);
          const knownRuff=before.some(j=>g.trump!=='NT'&&g.trump!=='S'&&k.voids[j].has('S')&&!k.voids[j].has(g.trump));
          if(!knownRuff)return three.id;
        }
      }
    }
  }

  // Hidden-partner feeding: a called high card gives team control, but feed disposable points rather than A/K/Q/J controls.
  if(!k.trick.length&&bidderTeam){
    const own=new Set(k.hand.map(c=>c.id)), otherCalls=g.calls.filter(id=>!own.has(id)&&!k.playedIds.has(id));
    for(const id of otherCalls){
      const called=deck().find(c=>c.id===id);if(!called)continue;
      const top=highestOutstandingInSuit(k,called.s);const safeCall=top&&top.id===called.id;if(!safeCall)continue;
      const feed=legal.filter(c=>c.s===called.s&&c.id!==id&&pts(c)>0&&c.id!=='3S'&&!['A','K','Q','J'].includes(c.r));
      if(feed.length)return disposableFeed(feed).id;
    }
  }

  // Never lead 3♠ merely because a teammate owns the top spade. Delivery must also be protected from trumping.
  if(!k.trick.length&&bidderTeam&&legal.some(c=>c.id==='3S')){
    const highest=highestOutstandingInSuit(k,'S');
    const calledCatcher=highest&&g.calls.includes(highest.id)&&!k.hand.some(c=>c.id===highest.id);
    if(calledCatcher){
      const trumpRisk=g.trump!=='NT'&&g.trump!=='S'&&k.trumpPlayed<deck().filter(c=>c.s===g.trump).length;
      const knownVoidSpadeOpponent=k.voids.some((v,j)=>j!==i&&!knownTeammate(g,k,i,j)&&v.has('S'));
      if(!trumpRisk&&!knownVoidSpadeOpponent)return '3S';
    }
  }

  // Use a called A/K to reveal/secure partnership when points genuinely need saving, not just for revelation.
  if(bidderTeam&&winners.length&&trickPoints>0&&!safePartnerWin){
    const calledWinner=winners.filter(c=>g.calls.includes(c.id)).sort((a,b)=>eff(a)-eff(b));
    if(calledWinner.length)return calledWinner[0].id;
  }

  // Opponent or uncertain winner: capture meaningful exposed points with the cheapest sufficient winner.
  if(winners.length&&!partnerWinning&&(trickPoints>=10||k.trick.length===4)){
    return winners.slice().sort((a,b)=>eff(a)-eff(b)||controlRank(a)-controlRank(b))[0].id;
  }

  // Default conservation: protect 3♠, A/K, then Q/J when a cheap legal loser exists.
  const preserveK=c=>c.r==='K'&&!k.playedIds.has('A'+c.s)&&!k.hand.some(x=>x.id==='A'+c.s)&&!g.calls.includes('A'+c.s);
  let pool=losers.length?losers.slice():legal.slice();
  if(bidderTeam){const no3=pool.filter(c=>c.id!=='3S');if(no3.length)pool=no3;}
  const low=pool.filter(c=>!['A','K','Q','J'].includes(c.r));if(low.length)pool=low;
  const nonReserved=pool.filter(c=>!preserveK(c));if(nonReserved.length)pool=nonReserved;
  return cheapest(pool).id;
}
function clearActionTimer(g){if(g.actionTimer){clearTimeout(g.actionTimer);g.actionTimer=null;}g.actionDeadline=null;}
function armActionTimer(g){
  clearActionTimer(g);if(!rooms.has(g.code))return;
  let seconds=0,kind=null,seat=null;
  if(g.phase==='bidding'&&g.bidTurn!=null&&!isBot(g,g.bidTurn)){seconds=60;kind='bid';seat=g.bidTurn;}
  else if(g.phase==='play'&&!g.resolvingTrick&&g.turn!=null&&g.playTimer>0&&!isBot(g,g.turn)){seconds=g.playTimer;kind='play';seat=g.turn;}
  if(!seconds){emit(g);return;}
  g.actionDeadline=Date.now()+seconds*1000;const token=`${kind}:${seat}:${g.actionDeadline}`;g.actionTimerToken=token;
  // Emit after the deadline exists. This fixes clients intermittently receiving a turn before its timer was armed.
  emit(g);
  g.actionTimer=setTimeout(()=>{g.actionTimer=null;g.actionDeadline=null;if(!rooms.has(g.code)||g.actionTimerToken!==token)return;
    if(kind==='bid'&&g.phase==='bidding'&&g.bidTurn===seat){handlePass(g,seat);armActionTimer(g);scheduleBot(g);}
    else if(kind==='play'&&g.phase==='play'&&!g.resolvingTrick&&g.turn===seat){const id=chooseBotCard(g,seat);if(id)play(g,seat,id);}
  },seconds*1000);
}
function scheduleBot(g){
  if(g.botTimer||!rooms.has(g.code))return;let i=null,action=null;
  if(g.phase==='bidding'&&g.bidTurn!=null&&isBot(g,g.bidTurn)){i=g.bidTurn;action='bid';}
  else if(g.phase==='contract'&&isBot(g,g.bidder)){i=g.bidder;action='contract';}
  else if(g.phase==='play'&&!g.resolvingTrick&&g.turn!=null&&isBot(g,g.turn)){i=g.turn;action='play';}
  if(!action)return;
  // Human-readable pacing: bots pause before acting so bids and cards can be followed.
  const baseDelay=action==='contract'?1800:action==='bid'?2250:1750;
  const jitter=action==='contract'?450:action==='bid'?400:500;
  g.botTimer=setTimeout(()=>{g.botTimer=null;if(!rooms.has(g.code))return;
    if(action==='bid'&&g.phase==='bidding'&&g.bidTurn===i&&isBot(g,i))botBid(g,i);
    else if(action==='contract'&&g.phase==='contract'&&g.bidder===i&&isBot(g,i))botContract(g,i);
    else if(action==='play'&&g.phase==='play'&&!g.resolvingTrick&&g.turn===i&&isBot(g,i)){const id=chooseBotCard(g,i);if(id)play(g,i,id);}
    emit(g);armActionTimer(g);scheduleBot(g);
  },baseDelay+Math.floor(Math.random()*jitter));
}

function restartMatch(g){
  clearActionTimer(g);if(g.botTimer){clearTimeout(g.botTimer);g.botTimer=null;}
  g.players.forEach(p=>{p.score=0;p.dealPoints=0;p.hand=[];});
  g.dealNo=0;g.matchWinners=[];g.lastResult=null;g.startBidder=0;g.phase='lobby';
  g.bid=null;g.incumbent=null;g.challenger=null;g.bidTurn=null;g.bidAction=null;g.passed=new Set();g.bidder=null;g.trump=null;g.reverse=false;g.calls=[];g.callHolders=[];g.teams=null;g.revealedPartners=new Set();g.revealedCalls=new Set();g.trick=[];g.lastTrick=[];g.leader=null;g.turn=null;g.teamPoints=[0,0];g.resolvingTrick=false;g.playedCards=[];g.firstLeadPending=false;g.actionDeadline=null;
  // A restart keeps seats and room settings, then immediately deals a fresh match when all five seats remain filled.
  if(g.players.length===5)return newDeal(g);emit(g);
}
function findRoom(socketId){return [...rooms.values()].find(r=>r.players.some(p=>p.id===socketId));}
function connectedHumans(g){return g.players.filter(p=>!p.isBot&&p.connected!==false&&p.id);}
function transferHost(g){const h=connectedHumans(g)[0];g.hostId=h?h.id:null;}
function clearDisconnectGrace(p){if(p.disconnectTimer){clearTimeout(p.disconnectTimer);p.disconnectTimer=null;}}
function makeSeatBot(g,i,nameSuffix=true){
  const p=g.players[i];if(!p)return;clearDisconnectGrace(p);const oldId=p.id;
  p.id=botId();p.isBot=true;p.autoMode=false;p.connected=true;p.reconnectToken=null;
  if(nameSuffix&&!/\(Bot\)$/.test(p.name))p.name=p.name+' (Bot)';
  if(g.hostId===oldId)transferHost(g);
  if(!connectedHumans(g).length){clearActionTimer(g);if(g.botTimer)clearTimeout(g.botTimer);rooms.delete(g.code);return;}
  emit(g);armActionTimer(g);scheduleBot(g);
}
function replaceHumanWithBot(s,notify=true){const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id);if(i<0)return;if(notify){s.leave(g.code);s.emit('leftGame');}makeSeatBot(g,i,true);}
function restoreDisconnectedSeat(g,s,token){
  const i=g.players.findIndex(p=>!p.isBot&&p.connected===false&&p.reconnectToken===token);if(i<0)return false;
  const p=g.players[i];clearDisconnectGrace(p);const old=p.id;p.id=s.id;p.connected=true;p.autoMode=false;s.join(g.code);if(g.hostId===old||!g.hostId)g.hostId=s.id;emit(g);armActionTimer(g);scheduleBot(g);return true;
}
function replaceableBotSeats(g){return g.players.map((p,i)=>p.isBot?{seat:i,name:p.name,score:p.score}:null).filter(Boolean);}
function joinIntoBotSeat(g,s,name,seat,token){
  seat=Number(seat);const p=g.players[seat];if(!p||!p.isBot)return false;
  p.id=s.id;p.name=String(name||`Player ${seat+1}`).slice(0,20);p.isBot=false;p.autoMode=false;p.connected=true;p.reconnectToken=token||null;s.join(g.code);if(!g.hostId)g.hostId=s.id;emit(g);armActionTimer(g);scheduleBot(g);return true;
}
io.on('connection',s=>{
  s.on('create',payload=>{const data=typeof payload==='object'&&payload?payload:{name:payload};const name=data.name,token=data.token;const code=roomCode(),g={code,hostId:s.id,players:[{id:s.id,name:String(name||'Player 1').slice(0,20),score:0,hand:[],isBot:false,autoMode:false,connected:true,reconnectToken:token||null}],phase:'lobby',startBidder:0,dealNo:0,openingRule:'bidder',playTimer:0,matchTarget:0,matchWinners:[],actionDeadline:null};rooms.set(code,g);s.join(code);emit(g);});
  s.on('join',({code,name,seat,token}={})=>{const g=rooms.get(String(code||'').toUpperCase());if(!g)return s.emit('errorMsg','Room unavailable.');
    if(token&&restoreDisconnectedSeat(g,s,token))return;
    if(g.phase==='lobby'&&g.players.length<5){g.players.push({id:s.id,name:String(name||`Player ${g.players.length+1}`).slice(0,20),score:0,hand:[],isBot:false,autoMode:false,connected:true,reconnectToken:token||null});s.join(g.code);return emit(g);}
    const bots=replaceableBotSeats(g);if(!bots.length)return s.emit('errorMsg','Room is full — all five seats belong to humans.');
    if(seat!==undefined&&seat!==null){if(!joinIntoBotSeat(g,s,name,seat,token))s.emit('errorMsg','That bot seat is no longer available.');return;}
    // A full room may still accept a human whenever at least one genuinely bot-owned seat exists,
    // including in the pre-game lobby. Watch-as-bot seats remain human-owned and never appear here.
    s.emit('replaceOptions',{code:g.code,options:bots});
  });
  s.on('addBot',()=>{const g=findRoom(s.id);if(!g||g.hostId!==s.id||g.phase!=='lobby'||g.players.length>=5)return;let n=1;const names=new Set(g.players.map(p=>p.name));while(names.has(`Bot ${n}`))n++;g.players.push({id:botId(),name:`Bot ${n}`,score:0,hand:[],isBot:true,autoMode:false,connected:true});emit(g);});
  s.on('settings',({openingRule,playTimer,matchTarget})=>{const g=findRoom(s.id);if(!g||g.hostId!==s.id||g.phase!=='lobby')return;if(['bidder','3C'].includes(openingRule))g.openingRule=openingRule;const t=Number(playTimer);if([0,60,90,120].includes(t))g.playTimer=t;const mt=Number(matchTarget);if([0,500,1000,1500,2000].includes(mt))g.matchTarget=mt;emit(g);});
  s.on('autoMode',enabled=>{const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id);if(i<0||g.players[i].isBot)return;g.players[i].autoMode=!!enabled;emit(g);if(g.players[i].autoMode){clearActionTimer(g);scheduleBot(g);}else{armActionTimer(g);}});
  s.on('start',()=>{const g=findRoom(s.id);if(g&&g.hostId===s.id&&g.players.length===5)newDeal(g);});
  s.on('pass',()=>{const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id);if(g.players[i]?.autoMode)return;handlePass(g,i);emit(g);armActionTimer(g);scheduleBot(g);});
  s.on('bid',a=>{const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id);if(g.players[i]?.autoMode)return;handleBid(g,i,a);emit(g);armActionTimer(g);scheduleBot(g);});
  s.on('stay',()=>{const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id);if(g.players[i]?.autoMode)return;stay(g,i);emit(g);armActionTimer(g);scheduleBot(g);});
  s.on('contract',({calls,trump,reverse})=>{const g=findRoom(s.id);if(!g||g.phase!=='contract'||g.players[g.bidder].id!==s.id||g.players[g.bidder].autoMode||![...SUITS,'NT'].includes(trump)||!Array.isArray(calls)||calls.length!==2||calls[0]===calls[1])return;const own=new Set(g.players[g.bidder].hand.map(c=>c.id));if(calls.some(x=>own.has(x)||!deck().some(c=>c.id===x)))return;g.calls=calls;g.trump=trump;g.reverse=!!reverse;const holders=calls.map(id=>g.players.findIndex(p=>p.hand.some(c=>c.id===id)));g.callHolders=holders;const team=new Set([g.bidder,...holders]);g.teams=g.players.map((_,i)=>team.has(i)?'bidder':'opponent');g.revealedPartners=new Set();g.revealedCalls=new Set();beginPlayAfterContract(g);});
  s.on('play',id=>{const g=findRoom(s.id);if(g){const i=g.players.findIndex(p=>p.id===s.id);if(!g.players[i]?.autoMode)play(g,i,id);}});
  s.on('nextDeal',()=>{const g=findRoom(s.id);if(g&&g.phase==='result'&&g.hostId===s.id)newDeal(g);});
  s.on('restartGame',()=>{const g=findRoom(s.id);if(g&&g.hostId===s.id&&g.phase!=='lobby')restartMatch(g);});
  s.on('endEarly',()=>{const g=findRoom(s.id);if(g&&g.hostId===s.id&&(g.matchTarget||0)===0&&outcomeDetermined(g)&&!g.resolvingTrick)finishDeal(g);});
  s.on('leave',()=>replaceHumanWithBot(s,true));
  s.on('disconnect',()=>{const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id),p=g.players[i];if(!p||p.isBot)return;p.connected=false;clearDisconnectGrace(p);p.disconnectTimer=setTimeout(()=>{if(!rooms.has(g.code)||p.connected!==false)return;makeSeatBot(g,i,true);},20000);emit(g);});
});
server.listen(PORT,()=>console.log(`250 running on port ${PORT}`));

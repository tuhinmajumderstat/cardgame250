const express=require('express'); const http=require('http'); const {Server}=require('socket.io');
const app=express(), server=http.createServer(app), io=new Server(server); app.use(express.static('public'));
const PORT=process.env.PORT||3000, MIN_BID=160, MAX_BID=250;
const SUITS=['S','H','D','C'], RANKS=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
const rooms=new Map(); const rankValue=r=>13-RANKS.indexOf(r);
function deck(){let d=[];for(const s of SUITS)for(const r of RANKS){if(r==='2'&&(s==='C'||s==='D'))continue;d.push({s,r,id:r+s});}return d;}
function shuffle(a){for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function pts(c){if(['A','K','Q','J','10'].includes(c.r))return 10;if(c.r==='5')return 5;if(c.r==='3'&&c.s==='S')return 30;return 0;}
function next(i,n=1){return (i+n)%5;} // seating array is anticlockwise play order
const isBot=(g,i)=>!!g.players[i]?.isBot;
const botId=()=>`bot:${Math.random().toString(36).slice(2,10)}`;
function roomCode(){let x;do{x=Math.random().toString(36).slice(2,6).toUpperCase()}while(rooms.has(x));return x;}
function outcomeDetermined(g){if(g.phase!=='play'||!g.teams||(g.revealedCalls?.size||0)<2)return false;return g.teamPoints[0]>=g.bid||g.teamPoints[1]>250-g.bid;}
function publicState(g,viewer){const me=g.players.findIndex(p=>p.id===viewer);const revealed=g.revealedPartners||new Set();const allPartnersRevealed=(g.revealedCalls?.size||0)>=2;const isHost=g.hostId===viewer;let privateRole=null;if(me>=0&&g.teams&&['play','result'].includes(g.phase)){if(me===g.bidder)privateRole='bidder';else{const partnerCallCount=(g.callHolders||[]).filter(i=>i===me).length;if(g.teams[me]==='bidder')privateRole=partnerCallCount===2?'double-partner':'partner';else privateRole='opponent';}}return {code:g.code,phase:g.phase,players:g.players.map((p,i)=>({name:p.name,seat:i,score:p.score,dealPoints:p.dealPoints||0,handCount:p.hand.length,isBot:!!p.isBot,passed:g.passed?.has(i)||false,role:(g.phase==='result'||i===g.bidder||revealed.has(i)||allPartnersRevealed)?(g.teams?g.teams[i]:null):null})),me,startBidder:g.startBidder,bid:g.bid,incumbent:g.incumbent,challenger:g.challenger,bidTurn:g.bidTurn,bidAction:g.bidAction,bidder:g.bidder,trump:g.trump,calls:g.calls,leader:g.leader,turn:g.turn,trick:g.trick,lastTrick:g.lastTrick||[],teamPoints:(allPartnersRevealed||g.phase==='result')?g.teamPoints:null,allPartnersRevealed,dealNo:g.dealNo,lastResult:g.lastResult,hand:me>=0?g.players[me].hand:[],legal:me>=0?legalCards(g,me):[],isHost,canStart:g.phase==='lobby'&&g.players.length===5&&isHost,canAddBot:g.phase==='lobby'&&g.players.length<5&&isHost,canNext:g.phase==='result'&&isHost,canEndEarly:outcomeDetermined(g)&&isHost,resolvingTrick:!!g.resolvingTrick,privateRole,openingRule:g.openingRule||'bidder',playTimer:g.playTimer||0,actionDeadline:g.actionDeadline||null};}
function emit(g){for(const p of g.players)if(!p.isBot)io.to(p.id).emit('state',publicState(g,p.id));}
function newDeal(g){g.dealNo++; const d=shuffle(deck());g.players.forEach((p,i)=>{p.dealPoints=0;p.hand=d.slice(i*10,i*10+10).sort((a,b)=>SUITS.indexOf(a.s)-SUITS.indexOf(b.s)||RANKS.indexOf(a.r)-RANKS.indexOf(b.r));});g.phase='bidding';g.bid=null;g.incumbent=null;g.challenger=null;g.bidTurn=g.startBidder;g.bidAction='open';g.passed=new Set();g.bidder=null;g.trump=null;g.calls=[];g.callHolders=[];g.teams=null;g.revealedPartners=new Set();g.revealedCalls=new Set();g.trick=[];g.lastTrick=[];g.leader=null;g.turn=null;g.teamPoints=[0,0];g.lastResult=null;g.resolvingTrick=false;g.playedCards=[];g.firstLeadPending=false;emit(g);armActionTimer(g);scheduleBot(g);}
function advanceOpening(g,idx){g.passed.add(idx);let j=next(idx);while(g.passed.has(j)&&j!==idx)j=next(j);if(g.passed.size===5){g.lastResult={text:'All five players passed. Deal abandoned.'};g.startBidder=next(g.startBidder);return newDeal(g);}g.bidTurn=j;g.bidAction='open';}
function nextUnpassedAfter(g,idx){let j=next(idx);while(g.passed.has(j)&&j!==idx)j=next(j);return j;}
function startChallenge(g){const c=nextUnpassedAfter(g,g.incumbent);if(c===g.incumbent){return winBid(g,g.incumbent);}g.challenger=c;g.bidTurn=c;g.bidAction='raise';}
function winBid(g,i){clearActionTimer(g);g.bidder=i;g.phase='contract';g.bidTurn=null;g.challenger=null;g.actionDeadline=null;}
function handlePass(g,i){if(g.phase!=='bidding'||g.bidTurn!==i)return;if(g.bidAction==='open'){advanceOpening(g,i);return;}if(g.bidAction==='raise'){g.passed.add(i);g.challenger=null;if(g.passed.size===4)return winBid(g,g.incumbent);startChallenge(g);return;}if(g.bidAction==='respond'){g.passed.add(i);g.incumbent=g.challenger;g.challenger=null;if(g.passed.size===4)return winBid(g,g.incumbent);startChallenge(g);}}
function handleBid(g,i,amount){amount=Number(amount);if(g.phase!=='bidding'||g.bidTurn!==i||amount%5||amount<MIN_BID||amount>MAX_BID)return;if(g.bidAction==='open'){if(amount!==MIN_BID)return;g.bid=amount;g.incumbent=i;startChallenge(g);return;}if(g.bidAction==='raise'){if(amount<=g.bid)return;g.bid=amount;g.bidTurn=g.incumbent;g.bidAction='respond';return;}}
function stay(g,i){if(g.phase!=='bidding'||g.bidTurn!==i||g.bidAction!=='respond'||i!==g.incumbent)return;g.bidTurn=g.challenger;g.bidAction='raise';}
function legalCards(g,i){if(g.phase!=='play'||g.turn!==i)return[];const h=g.players[i].hand;if(g.firstLeadPending&&g.openingRule==='3C'){return h.some(c=>c.id==='3C')?['3C']:[];}if(!g.trick.length)return h.map(c=>c.id);const suit=g.trick[0].card.s;const follow=h.filter(c=>c.s===suit);return (follow.length?follow:h).map(c=>c.id);}
function trickWinner(g){const lead=g.trick[0].card.s;let candidates=g.trump==='NT'?[]:g.trick.filter(x=>x.card.s===g.trump);if(!candidates.length)candidates=g.trick.filter(x=>x.card.s===lead);return candidates.reduce((a,b)=>rankValue(a.card.r)>rankValue(b.card.r)?a:b).player;}
function finishDeal(g){clearActionTimer(g);const bidderTeam=g.teams.map((t,i)=>t==='bidder'?i:null).filter(x=>x!==null);const opp=g.teams.map((t,i)=>t==='opponent'?i:null).filter(x=>x!==null);const bp=g.teamPoints[0], op=g.teamPoints[1], ok=bp>=g.bid; if(ok){for(const i of bidderTeam)g.players[i].score+=i===g.bidder?g.bid+50:g.bid;}else{g.players[g.bidder].score-=50;for(const i of opp)g.players[i].score+=op;}g.lastResult={text:ok?`Contract made: ${bp} ≥ ${g.bid}.`:`Contract failed: ${bp} < ${g.bid}. Opponents captured ${op}.`,bidderPoints:bp,opponentPoints:op,success:ok};g.phase='result';g.startBidder=next(g.startBidder);emit(g);}
function play(g,i,id){if(g.resolvingTrick||!legalCards(g,i).includes(id))return;clearActionTimer(g);const p=g.players[i], k=p.hand.findIndex(c=>c.id===id), card=p.hand.splice(k,1)[0];if(g.calls.includes(id)){g.revealedCalls.add(id);if(i!==g.bidder)g.revealedPartners.add(i);}g.trick.push({player:i,card});g.playedCards.push({player:i,card});if(g.firstLeadPending&&id==='3C')g.firstLeadPending=false;if(g.trick.length<5){g.turn=next(i);emit(g);armActionTimer(g);scheduleBot(g);return;}g.resolvingTrick=true;g.turn=null;emit(g);setTimeout(()=>{if(!rooms.has(g.code)||g.phase!=='play'||g.trick.length!==5)return;const w=trickWinner(g), tp=g.trick.reduce((s,x)=>s+pts(x.card),0);g.players[w].dealPoints=(g.players[w].dealPoints||0)+tp;g.teamPoints[g.teams[w]==='bidder'?0:1]+=tp;g.leader=w;g.turn=w;g.lastTrick=g.trick;g.trick=[];g.resolvingTrick=false;if(g.players.every(p=>!p.hand.length))return finishDeal(g);emit(g);armActionTimer(g);scheduleBot(g);},2600);}

function handStrength(g,i){
  const h=g.players[i].hand; let best=-999, bestTrump='NT';
  for(const tr of [...SUITS,'NT']){
    let v=h.reduce((z,c)=>z+pts(c),0)*0.16;
    for(const c of h){const rv=rankValue(c.r);if(tr!=='NT'&&c.s===tr)v+=rv*1.15+(pts(c)?2.5:0);else if(c.r==='A')v+=7;else if(c.r==='K')v+=3.5;}
    if(tr==='NT')v+=h.filter(c=>c.r==='A').length*5+h.filter(c=>c.r==='K').length*2;
    if(h.some(c=>c.id==='3S')&&h.some(c=>['AS','KS'].includes(c.id)))v+=7;
    if(v>best){best=v;bestTrump=tr;}
  }
  const ceiling=Math.max(155,Math.min(225,155+5*Math.floor(best/7)));
  return {ceiling,bestTrump};
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
  const h=g.players[i].hand, own=new Set(h.map(c=>c.id)), {bestTrump}=handStrength(g,i);let trump=bestTrump;
  const available=deck().filter(c=>!own.has(c.id));
  const suitCount=s=>h.filter(c=>c.s===s).length, has=id=>own.has(id);
  const score=c=>{let v=0;if(c.r==='A')v+=100;else if(c.r==='K')v+=65;else if(c.r==='Q')v+=35;else if(c.r==='J')v+=22;else if(c.r==='10')v+=18;if(c.s===trump)v+=18;if(c.id==='3S'&&(has('AS')||has('KS')))v+=120;if(c.r==='A'&&suitCount(c.s)>=2)v+=12;return v;};
  const calls=available.sort((a,b)=>score(b)-score(a)).slice(0,2).map(c=>c.id);
  g.calls=calls;g.trump=trump;const holders=calls.map(id=>g.players.findIndex(p=>p.hand.some(c=>c.id===id)));g.callHolders=holders;const team=new Set([g.bidder,...holders]);g.teams=g.players.map((_,j)=>team.has(j)?'bidder':'opponent');g.revealedPartners=new Set();g.revealedCalls=new Set();beginPlayAfterContract(g);
}
function currentTrickWinner(g){if(!g.trick.length)return null;const lead=g.trick[0].card.s;let a=g.trump==='NT'?[]:g.trick.filter(x=>x.card.s===g.trump);if(!a.length)a=g.trick.filter(x=>x.card.s===lead);return a.reduce((x,y)=>rankValue(x.card.r)>rankValue(y.card.r)?x:y).player;}
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
  return {hand,legal:new Set(legalCards(g,i)),trick:g.trick.slice(),played,trump:g.trump,calls:g.calls.slice(),bidder:g.bidder,myTeam:g.teams?.[i],revealed:new Set(g.revealedPartners||[]),playedIds,unseen,voids,trumpPlayed};
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
  return rankValue(a.r)>rankValue(b.r);
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
  return cards.sort((a,b)=>rankValue(b.r)-rankValue(a.r))[0]||null;
}
function chooseBotCard(g,i){
  const k=botKnowledge(g,i), legal=k.hand.filter(c=>k.legal.has(c.id));if(legal.length<=1)return legal[0]?.id;
  const teammate=j=>knownTeammate(g,k,i,j), lead=k.trick[0]?.card.s, winner=currentTrickWinner(g);
  const partnerWinning=winner!=null&&teammate(winner), safePartnerWin=partnerWinning&&safelyWinningForBot(g,k,i,winner);
  const trickPoints=k.trick.reduce((z,x)=>z+pts(x.card),0);
  const rankAsc=(a,b)=>rankValue(a.r)-rankValue(b.r), pointsDesc=(a,b)=>pts(b)-pts(a)||rankValue(a.r)-rankValue(b.r), pointsAsc=(a,b)=>pts(a)-pts(b)||rankValue(a.r)-rankValue(b.r);
  const wouldWin=c=>{const temp={...g,trick:[...g.trick,{player:i,card:c}]};return currentTrickWinner(temp)===i;};
  const winners=legal.filter(wouldWin), losers=legal.filter(c=>!wouldWin(c));
  const bidderTeam=k.myTeam==='bidder';

  // 1) 3S is 30-point cargo. If a teammate is safely taking ANY suit and 3S is legal, deliver it immediately.
  if(bidderTeam&&safePartnerWin){const three=legal.find(c=>c.id==='3S'&&!wouldWin(c));if(three)return three.id;}

  // 2) If a teammate has put 3S into this trick, make a strong effort to catch those 30 points.
  if(bidderTeam&&k.trick.some(x=>x.card.id==='3S'&&teammate(x.player))&&winners.length){
    return winners.sort((a,b)=>rankValue(a.r)-rankValue(b.r)||pts(a)-pts(b))[0].id;
  }

  // 3) Feed ordinary point cards to a SAFE teammate trick. Preserve an unnecessary superior A/K when a lower legal card can feed instead.
  if(safePartnerWin){
    const nonWinning=legal.filter(c=>!wouldWin(c));
    // A/K are control cards, not ordinary 10-point cargo. Preserve them unless forced.
    const expendable=nonWinning.filter(c=>!['A','K'].includes(c.r));
    if(expendable.length){const feed=expendable.slice().sort(pointsDesc);return feed[0].id;}
    const zero=nonWinning.filter(c=>pts(c)===0);if(zero.length)return zero.sort(rankAsc)[0].id;
  }

  // 4) Never overtake a teammate merely because we can. Follow suit is mandatory, so this applies only when another legal loser exists.
  if(partnerWinning&&losers.length){const cheap=losers.filter(c=>!['A','K'].includes(c.r));return (cheap.length?cheap:losers).sort(pointsAsc)[0].id;}

  // 5) Bidder-team lead strategy: draw/exhaust trump even before partners are publicly revealed.
  if(!k.trick.length&&bidderTeam&&g.trump!=='NT'){
    const myTrumps=legal.filter(c=>c.s===g.trump);
    const totalTrump=deck().filter(c=>c.s===g.trump).length;
    const outsideTrump=Math.max(0,totalTrump-k.trumpPlayed-myTrumps.length);
    if(myTrumps.length&&outsideTrump>0){
      // Lead a strong trump. If the higher trump is a called teammate card, it is safe to lead the next one down.
      const calledOutstanding=new Set(g.calls.filter(id=>id.endsWith(g.trump)&&!k.playedIds.has(id)));
      const sorted=myTrumps.slice().sort((a,b)=>rankValue(b.r)-rankValue(a.r));
      const top=sorted[0];
      const higher=deck().filter(c=>c.s===g.trump&&rankValue(c.r)>rankValue(top.r)&&!k.playedIds.has(c.id));
      if(!higher.length||higher.every(c=>calledOutstanding.has(c.id)))return top.id;
      // Even without control, partners commonly help strip trump; use the cheapest trump rather than burning a top card blindly.
      return myTrumps.slice().sort(rankAsc)[0].id;
    }
  }

  // 6) Hidden-partner feeding: lead points into another called high-card suit (especially a called Ace).
  if(!k.trick.length&&bidderTeam){
    const own=new Set(k.hand.map(c=>c.id));
    const otherCalls=g.calls.filter(id=>!own.has(id)&&!k.playedIds.has(id));
    for(const id of otherCalls){
      const called=deck().find(c=>c.id===id);if(!called)continue;
      const safeCall=called.r==='A'||(called.r==='K'&&k.playedIds.has('A'+called.s));
      if(!safeCall)continue;
      const feed=legal.filter(c=>c.s===called.s&&c.id!==id&&pts(c)>0&&c.id!=='3S').sort(pointsDesc);
      if(feed.length)return feed[0].id;
    }
  }

  // 7) Leading 3S is allowed only when the bidder team has a reliable catcher; otherwise protect it.
  if(!k.trick.length&&bidderTeam&&legal.some(c=>c.id==='3S')){
    const highest=highestOutstandingInSuit(k,'S');
    const highestTeamGuaranteed=highest&&(g.calls.includes(highest.id)||k.hand.some(c=>c.id===highest.id));
    // If our own highest card is the catcher, leading 3S cannot use it this trick, so require a called teammate catcher.
    const calledCatcher=highest&&g.calls.includes(highest.id)&&!k.hand.some(c=>c.id===highest.id);
    if(calledCatcher){const trumpRisk=g.trump!=='NT'&&g.trump!=='S'&&k.trumpPlayed<deck().filter(c=>c.s===g.trump).length;const knownVoidSpadeOpponent=k.voids.some((v,j)=>j!==i&&!knownTeammate(g,k,i,j)&&v.has('S'));if(!trumpRisk&&!knownVoidSpadeOpponent)return '3S';}
    // Otherwise leave 3S protected; e.g. A already gone and unknown K outstanding => do not lead it.
  }

  // 8) A called A/K should reveal itself when it can secure meaningful points; don't burn it in a worthless trick unnecessarily.
  if(bidderTeam&&winners.length&&trickPoints>0){
    const calledWinner=winners.filter(c=>g.calls.includes(c.id)).sort((a,b)=>rankValue(a.r)-rankValue(b.r));
    if(calledWinner.length)return calledWinner[0].id;
  }

  // 9) If useful points are exposed, take them with the cheapest sufficient winner.
  if(winners.length&&(trickPoints>=10||k.trick.length===4))return winners.sort((a,b)=>rankValue(a.r)-rankValue(b.r)||pts(a)-pts(b))[0].id;

  // 10) Preserve K while an unknown A of that suit is outstanding, and protect 3S until a safe delivery opportunity appears.
  const preserveK=c=>c.r==='K'&&!k.playedIds.has('A'+c.s)&&!k.hand.some(x=>x.id==='A'+c.s)&&!g.calls.includes('A'+c.s);
  let pool=losers.length?losers.slice():legal.slice();const nonAK=pool.filter(c=>!['A','K'].includes(c.r));if(nonAK.length)pool=nonAK;const nonReserved=pool.filter(c=>!preserveK(c));if(nonReserved.length)pool=nonReserved;
  if(bidderTeam){const no3=pool.filter(c=>c.id!=='3S');if(no3.length)pool=no3;}
  return pool.sort(pointsAsc)[0].id;
}
function clearActionTimer(g){if(g.actionTimer){clearTimeout(g.actionTimer);g.actionTimer=null;}g.actionDeadline=null;}
function armActionTimer(g){
  clearActionTimer(g);if(!rooms.has(g.code))return;
  let seconds=0,kind=null,seat=null;
  if(g.phase==='bidding'&&g.bidTurn!=null){seconds=60;kind='bid';seat=g.bidTurn;}
  else if(g.phase==='play'&&!g.resolvingTrick&&g.turn!=null&&g.playTimer>0){seconds=g.playTimer;kind='play';seat=g.turn;}
  if(!seconds)return;
  g.actionDeadline=Date.now()+seconds*1000;const token=`${kind}:${seat}:${g.actionDeadline}`;g.actionTimerToken=token;
  g.actionTimer=setTimeout(()=>{g.actionTimer=null;g.actionDeadline=null;if(!rooms.has(g.code)||g.actionTimerToken!==token)return;
    if(kind==='bid'&&g.phase==='bidding'&&g.bidTurn===seat){handlePass(g,seat);emit(g);armActionTimer(g);scheduleBot(g);}
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
    if(action==='bid'&&g.phase==='bidding'&&g.bidTurn===i)botBid(g,i);
    else if(action==='contract'&&g.phase==='contract'&&g.bidder===i)botContract(g,i);
    else if(action==='play'&&g.phase==='play'&&!g.resolvingTrick&&g.turn===i){const id=chooseBotCard(g,i);if(id)play(g,i,id);}
    emit(g);armActionTimer(g);scheduleBot(g);
  },baseDelay+Math.floor(Math.random()*jitter));
}

function findRoom(socketId){return [...rooms.values()].find(r=>r.players.some(p=>p.id===socketId));}
function leaveGame(s){const g=findRoom(s.id);if(!g)return;clearActionTimer(g);const wasHost=g.hostId===s.id;const i=g.players.findIndex(p=>p.id===s.id);g.players.splice(i,1);s.leave(g.code);s.emit('leftGame');if(wasHost){for(const p of g.players)io.to(p.id).emit('roomClosed','The room creator left, so the room was closed.');rooms.delete(g.code);return;}if(!g.players.length){rooms.delete(g.code);return;}if(g.phase!=='lobby'){g.phase='lobby';g.dealNo=0;g.startBidder=0;g.players.forEach(p=>p.hand=[]);g.bid=null;g.bidder=null;g.calls=[];g.trump=null;g.teams=null;g.revealedPartners=new Set();g.revealedCalls=new Set();g.passed=new Set();g.trick=[];g.teamPoints=[0,0];g.lastResult={text:'A player left. The current deal was cancelled.'};}else if(g.startBidder>=g.players.length)g.startBidder=0;emit(g);}
io.on('connection',s=>{s.on('create',name=>{const code=roomCode(),g={code,hostId:s.id,players:[{id:s.id,name:String(name||'Player 1').slice(0,20),score:0,hand:[],isBot:false}],phase:'lobby',startBidder:0,dealNo:0,openingRule:'bidder',playTimer:0,actionDeadline:null};rooms.set(code,g);s.join(code);emit(g);});s.on('join',({code,name})=>{const g=rooms.get(String(code).toUpperCase());if(!g||g.phase!=='lobby'||g.players.length>=5)return s.emit('errorMsg','Room unavailable.');g.players.push({id:s.id,name:String(name||`Player ${g.players.length+1}`).slice(0,20),score:0,hand:[],isBot:false});s.join(g.code);emit(g);});s.on('addBot',()=>{const g=findRoom(s.id);if(!g||g.hostId!==s.id||g.phase!=='lobby'||g.players.length>=5)return;let n=1;const names=new Set(g.players.map(p=>p.name));while(names.has(`Bot ${n}`))n++;g.players.push({id:botId(),name:`Bot ${n}`,score:0,hand:[],isBot:true});emit(g);});s.on('settings',({openingRule,playTimer})=>{const g=findRoom(s.id);if(!g||g.hostId!==s.id||g.phase!=='lobby')return;if(['bidder','3C'].includes(openingRule))g.openingRule=openingRule;const t=Number(playTimer);if([0,60,90,120].includes(t))g.playTimer=t;emit(g);});s.on('start',()=>{const g=findRoom(s.id);if(g&&g.hostId===s.id&&g.players.length===5)newDeal(g);});s.on('pass',()=>{const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id);handlePass(g,i);emit(g);armActionTimer(g);scheduleBot(g);});s.on('bid',a=>{const g=findRoom(s.id);if(!g)return;const i=g.players.findIndex(p=>p.id===s.id);handleBid(g,i,a);emit(g);armActionTimer(g);scheduleBot(g);});s.on('stay',()=>{const g=findRoom(s.id);if(!g)return;stay(g,g.players.findIndex(p=>p.id===s.id));emit(g);armActionTimer(g);scheduleBot(g);});s.on('contract',({calls,trump})=>{const g=findRoom(s.id);if(!g||g.phase!=='contract'||g.players[g.bidder].id!==s.id||![...SUITS,'NT'].includes(trump)||!Array.isArray(calls)||calls.length!==2||calls[0]===calls[1])return;const own=new Set(g.players[g.bidder].hand.map(c=>c.id));if(calls.some(x=>own.has(x)||!deck().some(c=>c.id===x)))return;g.calls=calls;g.trump=trump;const holders=calls.map(id=>g.players.findIndex(p=>p.hand.some(c=>c.id===id)));g.callHolders=holders;const team=new Set([g.bidder,...holders]);g.teams=g.players.map((_,i)=>team.has(i)?'bidder':'opponent');g.revealedPartners=new Set();g.revealedCalls=new Set();beginPlayAfterContract(g);});s.on('play',id=>{const g=findRoom(s.id);if(g)play(g,g.players.findIndex(p=>p.id===s.id),id);});s.on('nextDeal',()=>{const g=findRoom(s.id);if(g&&g.phase==='result'&&g.hostId===s.id)newDeal(g);});s.on('endEarly',()=>{const g=findRoom(s.id);if(g&&g.hostId===s.id&&outcomeDetermined(g)&&!g.resolvingTrick)finishDeal(g);});s.on('leave',()=>leaveGame(s));});
server.listen(PORT,()=>console.log(`250 running on port ${PORT}`));

(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const els = {
    targetSwatch: $('#targetSwatch'), roundText: $('#roundText'), roundIcons: $('#roundIcons'),
    totalScore: $('#totalScore'), soundBtn: $('#soundBtn'), vessel: $('#vessel'), liquid: $('#liquid'),
    measureMarks: $('#measureMarks'), opaqueCover: $('#opaqueCover'), fillWrap: $('#fillWrap'), fillPct: $('#fillPct'),
    fillBar: $('#fillBar'), roundInstruction: $('#roundInstruction'), coffeeBtn: $('#coffeeBtn'), milkBtn: $('#milkBtn'),
    coffeeUse: $('#coffeeUse'), milkUse: $('#milkUse'), pourStream: $('#pourStream'), toast: $('#toast'),
    startModal: $('#startModal'), startBtn: $('#startBtn'), resultModal: $('#resultModal'), resultKicker: $('#resultKicker'),
    resultTitle: $('#resultTitle'), roundScore: $('#roundScore'), colorScore: $('#colorScore'), volumeScore: $('#volumeScore'),
    targetRatioText: $('#targetRatioText'), actualRatioText: $('#actualRatioText'), finalFillText: $('#finalFillText'), nextBtn: $('#nextBtn'),
    finalModal: $('#finalModal'), finalScore: $('#finalScore'), rankText: $('#rankText'), roundBreakdown: $('#roundBreakdown'), retryBtn: $('#retryBtn')
  };

  const ROUND_DATA = [
    { key:'beaker', icon:'🧪', name:'BEAKER', rate:0.112, wobble:0.010, marks:true, blind:false, instruction:'目盛りつき。まずは感覚をつかもう。' },
    { key:'straight', icon:'🥃', name:'STRAIGHT GLASS', rate:0.115, wobble:0.014, marks:false, blind:false, instruction:'目盛りなし。液面だけを頼りに。' },
    { key:'tall', icon:'🥤', name:'TALL GLASS', rate:0.110, wobble:0.018, marks:false, blind:false, instruction:'細長いグラス。液面がどんどん上がる！' },
    { key:'cocktail', icon:'🍸', name:'COCKTAIL GLASS', rate:0.108, wobble:0.020, marks:false, blind:false, instruction:'形がクセ者。高さと量の感覚がズレる。' },
    { key:'opaque', icon:'🫗', name:'OPAQUE GLASS', rate:0.112, wobble:0.016, marks:false, blind:true, instruction:'FINAL：中身も残量も見えない。注いだ時間と音を信じろ。' }
  ];

  const state = {
    round:0,
    coffee:0,
    milk:0,
    targetCoffee:50,
    used:{coffee:false,milk:false},
    pouring:null,
    pourStart:0,
    lastFrame:0,
    overflow:false,
    finished:false,
    total:0,
    roundScores:[],
    soundOn:true,
    audio:null,
    musicTimer:null,
    musicStep:0
  };

  function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
  function rand(min,max){ return Math.random()*(max-min)+min; }
  function totalVolume(){ return state.coffee + state.milk; }
  function fillRatio(){ return totalVolume(); }
  function actualCoffeeRatio(){
    const t = totalVolume();
    return t <= 0 ? 0 : (state.coffee / t) * 100;
  }

  // Warm coffee-milk interpolation. 0% coffee = creamy milk, 100% coffee = deep roast.
  function coffeeMilkColor(coffeePct){
    const t = clamp(coffeePct,0,100)/100;
    const milk = [255,247,220];
    const coffee = [74,38,25];
    // eased interpolation gives nicer mid-tones than a straight RGB blend
    const e = Math.pow(t,0.78);
    const rgb = milk.map((v,i)=>Math.round(v+(coffee[i]-v)*e));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function colorPoints(){
    const diff = Math.abs(actualCoffeeRatio() - state.targetCoffee);
    // Gaussian-like nonlinear curve: perfect near 100, drops quickly as the color drifts.
    return clamp(100 * Math.exp(-Math.pow(diff / 11.5, 2)),0,100);
  }

  function volumePoints(){
    const r = clamp(fillRatio(),0,1);
    // Nonlinear risk/reward: filling the final 10% matters a lot.
    return 100 * Math.pow(r,4.0);
  }

  function calcRoundScore(){
    if(state.overflow) return { color:0, volume:0, score:0 };
    const color = colorPoints();
    const volume = volumePoints();
    return { color, volume, score:Math.round(color * volume) };
  }

  function setupRoundIcons(){
    els.roundIcons.innerHTML = '';
    ROUND_DATA.forEach((r,i)=>{
      const d = document.createElement('div');
      d.className = 'round-icon';
      d.dataset.index = i+1;
      d.textContent = r.icon;
      els.roundIcons.appendChild(d);
    });
  }

  function updateRoundIcons(){
    [...els.roundIcons.children].forEach((el,i)=>{
      el.classList.toggle('active', i === state.round);
      el.classList.toggle('done', i < state.round);
    });
  }

  function drawMarks(show){
    els.measureMarks.innerHTML = '';
    els.measureMarks.style.display = show ? 'block' : 'none';
    if(!show) return;
    [20,40,60,80].forEach(p=>{
      const s = document.createElement('span');
      s.style.bottom = `${p}%`;
      s.dataset.label = `${p}`;
      els.measureMarks.appendChild(s);
    });
  }

  function setupRound(){
    const data = ROUND_DATA[state.round];
    state.coffee = 0;
    state.milk = 0;
    state.used.coffee = false;
    state.used.milk = false;
    state.pouring = null;
    state.overflow = false;
    state.finished = false;
    state.targetCoffee = Math.round(rand(10,90));

    els.roundText.textContent = `${state.round+1} / ${ROUND_DATA.length}`;
    els.targetSwatch.style.background = coffeeMilkColor(state.targetCoffee);
    els.vessel.className = `vessel ${data.key}`;
    els.liquid.style.background = coffeeMilkColor(0);
    els.liquid.style.height = '0%';
    els.liquid.style.clipPath = '';
    els.fillBar.style.width = '0%';
    els.fillPct.textContent = '0%';
    els.fillWrap.classList.toggle('blind', data.blind);
    els.roundInstruction.textContent = data.instruction;
    els.coffeeBtn.classList.remove('used','pouring');
    els.milkBtn.classList.remove('used','pouring');
    els.coffeeBtn.disabled = false;
    els.milkBtn.disabled = false;
    els.coffeeUse.textContent = '1 USE';
    els.milkUse.textContent = '1 USE';
    drawMarks(data.marks);
    updateRoundIcons();
    render();
  }

  function render(){
    const data = ROUND_DATA[state.round];
    const fill = clamp(fillRatio(),0,1.12);
    const pct = fill*100;
    const visiblePct = clamp(pct,0,100);
    const color = totalVolume() > 0 ? coffeeMilkColor(actualCoffeeRatio()) : coffeeMilkColor(0);
    els.liquid.style.background = color;

    if(data.key === 'cocktail'){
      // Bowl gets wider toward the top. We approximate volume→height with a square-root curve.
      const h = clamp(Math.sqrt(clamp(fill,0,1))*100,0,100);
      els.liquid.style.height = `${71 * h/100}%`;
      const topHalfWidth = 50 * (h/100);
      els.liquid.style.clipPath = `polygon(${50-topHalfWidth}% 0%, ${50+topHalfWidth}% 0%, 50% 100%, 50% 100%)`;
    } else {
      els.liquid.style.height = `${visiblePct}%`;
      els.liquid.style.clipPath = '';
    }

    els.fillBar.style.width = `${visiblePct}%`;
    els.fillPct.textContent = `${Math.min(999,Math.round(pct))}%`;
    els.totalScore.textContent = Math.round(state.total).toLocaleString('en-US');
  }

  function showToast(text, ms=700){
    els.toast.textContent = text;
    els.toast.classList.remove('hidden');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(()=>els.toast.classList.add('hidden'),ms);
  }

  function beginPour(type, ev){
    if(state.finished || state.overflow || state.pouring || state.used[type]) return;
    if(ev) ev.preventDefault();
    ensureAudio();
    state.pouring = type;
    state.pourStart = performance.now();
    state.lastFrame = state.pourStart;
    const btn = type === 'coffee' ? els.coffeeBtn : els.milkBtn;
    btn.classList.add('pouring');
    els.pourStream.className = `pour-stream ${type}`;
    playPourStart(type);
    requestAnimationFrame(pourLoop);
  }

  function endPour(type, ev){
    if(ev) ev.preventDefault();
    if(state.pouring !== type) return;
    state.pouring = null;
    state.used[type] = true;
    const btn = type === 'coffee' ? els.coffeeBtn : els.milkBtn;
    const badge = type === 'coffee' ? els.coffeeUse : els.milkUse;
    btn.classList.remove('pouring');
    btn.classList.add('used');
    btn.disabled = true;
    badge.textContent = 'USED';
    els.pourStream.className = 'pour-stream hidden';
    playPourStop(type);
    if(state.used.coffee && state.used.milk && !state.overflow){
      setTimeout(finishRound, 350);
    }
  }

  function pourLoop(now){
    if(!state.pouring || state.overflow) return;
    const dt = Math.min(0.05,(now-state.lastFrame)/1000);
    state.lastFrame = now;
    const data = ROUND_DATA[state.round];
    const elapsed = (now-state.pourStart)/1000;
    // Small deterministic-looking pulse + tiny randomness keeps the stream alive without making it unfair.
    const pulse = 1 + Math.sin(elapsed*7.5)*data.wobble + rand(-data.wobble*.22,data.wobble*.22);
    const delta = data.rate * pulse * dt;
    state[state.pouring] += delta;

    if(totalVolume() > 1){
      triggerOverflow();
      return;
    }

    render();
    updatePourTone();
    requestAnimationFrame(pourLoop);
  }

  function triggerOverflow(){
    state.overflow = true;
    state.pouring = null;
    state.finished = true;
    els.coffeeBtn.classList.remove('pouring');
    els.milkBtn.classList.remove('pouring');
    els.coffeeBtn.disabled = true;
    els.milkBtn.disabled = true;
    els.pourStream.className = 'pour-stream hidden';
    render();
    playOverflow();
    showToast('OVERFLOW!\n0 POINT',1000);
    setTimeout(finishRound,1050);
  }

  function finishRound(){
    if(state.finished && !state.overflow) return;
    state.finished = true;
    const res = calcRoundScore();
    state.roundScores[state.round] = res.score;
    state.total = state.roundScores.reduce((a,b)=>a+(b||0),0);
    render();

    els.resultKicker.textContent = state.overflow ? 'ROUND FAILED' : `ROUND ${state.round+1} RESULT`;
    els.resultTitle.textContent = state.overflow ? 'SPILLED!' : scoreTitle(res.score);
    els.roundScore.textContent = res.score.toLocaleString('en-US');
    els.colorScore.textContent = Math.round(res.color);
    els.volumeScore.textContent = Math.round(res.volume);
    els.targetRatioText.textContent = `Coffee ${state.targetCoffee}%`;
    els.actualRatioText.textContent = totalVolume() > 0 ? `Coffee ${Math.round(actualCoffeeRatio())}%` : '--';
    els.finalFillText.textContent = `${Math.round(fillRatio()*1000)/10}%`;
    els.nextBtn.textContent = state.round === ROUND_DATA.length-1 ? 'FINAL SCORE' : 'NEXT ROUND';
    els.resultModal.classList.add('open');
    if(!state.overflow) playResult(res.score);
  }

  function scoreTitle(score){
    if(score >= 9400) return 'PERFECT POUR!';
    if(score >= 8000) return 'GREAT MIX!';
    if(score >= 6000) return 'NICE MIX!';
    if(score >= 3500) return 'NOT BAD!';
    return 'MORE PRACTICE!';
  }

  function nextRound(){
    els.resultModal.classList.remove('open');
    if(state.round >= ROUND_DATA.length-1){
      showFinal();
      return;
    }
    state.round++;
    setupRound();
    playTransition();
  }

  function showFinal(){
    els.finalScore.textContent = Math.round(state.total).toLocaleString('en-US');
    const max = ROUND_DATA.length * 10000;
    const rate = state.total / max;
    const rank = rate>=.9?'S':rate>=.78?'A':rate>=.62?'B':rate>=.45?'C':'D';
    els.rankText.textContent = `RANK ${rank}`;
    els.roundBreakdown.innerHTML = '';
    state.roundScores.forEach((s,i)=>{
      const d = document.createElement('div');
      d.innerHTML = `R${i+1}<strong>${Math.round(s).toLocaleString('en-US')}</strong>`;
      els.roundBreakdown.appendChild(d);
    });
    els.finalModal.classList.add('open');
    playFinal(rank);
  }

  function resetGame(){
    els.finalModal.classList.remove('open');
    state.round = 0;
    state.total = 0;
    state.roundScores = [];
    setupRound();
  }

  function bindHoldButton(btn,type){
    btn.addEventListener('pointerdown',(e)=>{ btn.setPointerCapture?.(e.pointerId); beginPour(type,e); });
    btn.addEventListener('pointerup',(e)=>endPour(type,e));
    btn.addEventListener('pointercancel',(e)=>endPour(type,e));
    btn.addEventListener('lostpointercapture',(e)=>endPour(type,e));
    btn.addEventListener('contextmenu',(e)=>e.preventDefault());
  }

  // ---------- Web Audio: no external audio files needed ----------
  function ensureAudio(){
    if(!state.soundOn) return;
    if(!state.audio){
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return;
      state.audio = new Ctx();
      startMusic();
    }
    if(state.audio.state === 'suspended') state.audio.resume();
  }

  function tone(freq,dur=0.08,type='sine',gain=0.04,when=0){
    if(!state.soundOn || !state.audio) return;
    const ctx = state.audio;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001,ctx.currentTime+when);
    g.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+when+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+when+dur);
    o.connect(g).connect(ctx.destination); o.start(ctx.currentTime+when); o.stop(ctx.currentTime+when+dur+.02);
  }

  function noiseBurst(dur=0.16,gain=0.04,highpass=500){
    if(!state.soundOn || !state.audio) return;
    const ctx = state.audio;
    const buffer = ctx.createBuffer(1,Math.floor(ctx.sampleRate*dur),ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const f = ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=highpass;
    const g = ctx.createGain(); g.gain.value=gain;
    src.connect(f).connect(g).connect(ctx.destination); src.start();
  }

  function playPourStart(type){
    tone(type==='coffee'?150:240,.09,'triangle',.035);
    noiseBurst(.11,.025,type==='coffee'?220:900);
  }
  function playPourStop(type){ tone(type==='coffee'?120:210,.08,'sine',.028); }
  function updatePourTone(){
    if(!state.audio || !state.soundOn || Math.random()>.075) return;
    const base = state.pouring==='coffee'?190:320;
    const near = clamp(fillRatio(),0,1);
    tone(base + near*90,.045,'sine',.011);
  }
  function playOverflow(){ noiseBurst(.35,.09,260); tone(90,.38,'sawtooth',.055); tone(70,.48,'square',.025,.05); }
  function playResult(score){
    const good = score/10000;
    tone(440,.12,'triangle',.04);
    tone(550+good*140,.13,'triangle',.04,.09);
    tone(660+good*190,.18,'triangle',.045,.18);
  }
  function playTransition(){ tone(390,.08,'sine',.025); tone(520,.1,'sine',.025,.07); }
  function playFinal(rank){
    const seq = rank==='S'?[523,659,784,1047]:[392,494,587,784];
    seq.forEach((f,i)=>tone(f,.18,'triangle',.045,i*.11));
  }

  function startMusic(){
    if(state.musicTimer || !state.soundOn || !state.audio) return;
    const melody = [261.6,329.6,392,329.6,293.7,349.2,440,349.2];
    const bass = [130.8,146.8,164.8,146.8];
    state.musicTimer = setInterval(()=>{
      if(!state.soundOn || !state.audio) return;
      const i = state.musicStep++;
      tone(melody[i%melody.length],.18,'sine',.010);
      if(i%2===0) tone(bass[Math.floor(i/2)%bass.length],.22,'triangle',.008);
      if(i%4===0) noiseBurst(.03,.005,2600);
    },310);
  }

  function toggleSound(){
    state.soundOn = !state.soundOn;
    els.soundBtn.textContent = state.soundOn ? '🔊' : '🔇';
    if(state.soundOn){ ensureAudio(); startMusic(); }
  }

  function startGame(){
    ensureAudio();
    els.startModal.classList.remove('open');
    setupRound();
    playTransition();
  }

  setupRoundIcons();
  bindHoldButton(els.coffeeBtn,'coffee');
  bindHoldButton(els.milkBtn,'milk');
  els.startBtn.addEventListener('click',startGame);
  els.nextBtn.addEventListener('click',nextRound);
  els.retryBtn.addEventListener('click',resetGame);
  els.soundBtn.addEventListener('click',toggleSound);
  window.addEventListener('blur',()=>{ if(state.pouring) endPour(state.pouring); });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden && state.pouring) endPour(state.pouring); });

  setupRound();
})();

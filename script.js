(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const els = {
    targetSwatch: $('#targetSwatch'), roundText: $('#roundText'), roundIcons: $('#roundIcons'),
    totalScore: $('#totalScore'), soundBtn: $('#soundBtn'), titleBtn: $('#titleBtn'), vessel: $('#vessel'), liquid: $('#liquid'),
    measureMarks: $('#measureMarks'), roundName: $('#roundName'), coffeeBtn: $('#coffeeBtn'), milkBtn: $('#milkBtn'),
    coffeeUse: $('#coffeeUse'), milkUse: $('#milkUse'), pourStream: $('#pourStream'), toast: $('#toast'),
    startModal: $('#startModal'), startBtn: $('#startBtn'), resultModal: $('#resultModal'), resultKicker: $('#resultKicker'),
    resultTitle: $('#resultTitle'), roundScore: $('#roundScore'), colorScore: $('#colorScore'), volumeScore: $('#volumeScore'),
    targetRatioText: $('#targetRatioText'), actualRatioText: $('#actualRatioText'), finalFillText: $('#finalFillText'), nextBtn: $('#nextBtn'),
    finalModal: $('#finalModal'), finalScore: $('#finalScore'), rankText: $('#rankText'), roundBreakdown: $('#roundBreakdown'), retryBtn: $('#retryBtn')
  };

  const ROUND_DATA = [
    { key:'beaker', name:'BEAKER', rate:0.148, wobble:0.003, marks:true, blind:false },
    { key:'straight', name:'STRAIGHT GLASS', rate:0.148, wobble:0.004, marks:false, blind:false },
    { key:'tall', name:'SLIM GLASS', rate:0.145, wobble:0.004, marks:false, blind:false },
    { key:'cocktail', name:'COCKTAIL GLASS', rate:0.142, wobble:0.005, marks:false, blind:false },
    { key:'opaque', name:'BLIND GLASS', rate:0.145, wobble:0.004, marks:false, blind:true }
  ];

  const state = {
    round: 0,
    coffee: 0,
    milk: 0,
    targetCoffee: 50,
    used: { coffee:false, milk:false },
    pouring: null,
    pourStart: 0,
    lastFrame: 0,
    overflow: false,
    finished: false,
    transitioning: false,
    total: 0,
    roundScores: [],
    soundOn: true,
    audio: null,
    musicTimer: null,
    musicStep: 0,
    pourAudio: null,
    noiseBuffer: null
  };

  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const rand = (min,max) => Math.random()*(max-min)+min;
  const totalVolume = () => state.coffee + state.milk;
  const fillRatio = () => totalVolume();

  function actualCoffeeRatio(){
    const t = totalVolume();
    return t <= 0 ? 0 : (state.coffee / t) * 100;
  }

  function coffeeMilkColor(coffeePct){
    const t = clamp(coffeePct,0,100)/100;
    // Milk is deliberately warm/cream rather than pure white so it remains visible in the glass.
    const milk = [250, 239, 207];
    const coffee = [70, 35, 23];
    const e = Math.pow(t,0.78);
    const rgb = milk.map((v,i)=>Math.round(v+(coffee[i]-v)*e));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function colorPoints(){
    if(totalVolume() <= 0) return 0;
    const diff = Math.abs(actualCoffeeRatio() - state.targetCoffee);
    // Non-linear: tiny differences near perfect matter a lot, large misses fall sharply.
    return clamp(100 * Math.exp(-Math.pow(diff / 11.5, 2)),0,100);
  }

  function volumePoints(){
    const r = clamp(fillRatio(),0,1);
    // Non-linear risk/reward: the last few percent are worth disproportionately more.
    return 100 * Math.pow(r,4.15);
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
      const silhouette = document.createElement('span');
      silhouette.className = `round-vessel-icon mini-${r.key}`;
      silhouette.setAttribute('aria-hidden','true');
      d.appendChild(silhouette);
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

    // Four clean major marks only. This avoids stray upper ticks around the beaker rim.
    [20,40,60,80].forEach((p)=>{
      const s = document.createElement('span');
      s.style.bottom = `${p}%`;
      s.dataset.label = `${p}`;
      els.measureMarks.appendChild(s);
    });
  }

  function resetRoundState(){
    state.coffee = 0;
    state.milk = 0;
    state.used.coffee = false;
    state.used.milk = false;
    state.pouring = null;
    state.overflow = false;
    state.finished = false;
    state.targetCoffee = Math.round(rand(10,90));
  }

  function setControlsEnabled(enabled){
    els.coffeeBtn.disabled = !enabled || state.used.coffee;
    els.milkBtn.disabled = !enabled || state.used.milk;
  }

  function setupRound({animate=true} = {}){
    const data = ROUND_DATA[state.round];
    resetRoundState();

    els.roundText.textContent = `${state.round+1} / ${ROUND_DATA.length}`;
    els.targetSwatch.style.background = coffeeMilkColor(state.targetCoffee);
    els.roundName.textContent = data.name;
    els.liquid.style.background = coffeeMilkColor(0);
    els.liquid.style.height = '0%';
    els.liquid.style.clipPath = '';
    els.coffeeBtn.classList.remove('used','pouring');
    els.milkBtn.classList.remove('used','pouring');
    els.coffeeUse.textContent = '1 USE';
    els.milkUse.textContent = '1 USE';
    drawMarks(data.marks);
    updateRoundIcons();

    state.transitioning = animate;
    els.vessel.className = `vessel ${data.key}${animate ? ' slide-enter' : ''}`;
    setControlsEnabled(!animate);
    render();

    if(animate){
      window.setTimeout(()=>{
        els.vessel.classList.remove('slide-enter');
        state.transitioning = false;
        setControlsEnabled(true);
      }, 620);
    }
  }

  function render(){
    const data = ROUND_DATA[state.round];
    const fill = clamp(fillRatio(),0,1.12);
    const visiblePct = clamp(fill*100,0,100);
    const color = totalVolume() > 0 ? coffeeMilkColor(actualCoffeeRatio()) : coffeeMilkColor(0);
    els.liquid.style.background = color;

    if(data.key === 'cocktail'){
      // Martini bowl: volume grows quickly near the top, so height is deliberately non-linear.
      const h = clamp(Math.pow(clamp(fill,0,1),0.48)*100,0,100);
      els.liquid.style.height = `${70 * h/100}%`;
      const half = 48 * (h/100);
      els.liquid.style.clipPath = `polygon(${50-half}% 0%, ${50+half}% 0%, 53% 100%, 47% 100%)`;
    }else{
      els.liquid.style.height = `${visiblePct}%`;
      els.liquid.style.clipPath = '';
    }

    // Final round hides the liquid completely; sound becomes the fill cue.
    els.liquid.style.visibility = data.blind ? 'hidden' : 'visible';
    els.totalScore.textContent = Math.round(state.total).toLocaleString('en-US');
  }

  function showToast(text, ms=700){
    els.toast.textContent = text;
    els.toast.classList.remove('hidden');
    clearTimeout(showToast.t);
    showToast.t = setTimeout(()=>els.toast.classList.add('hidden'),ms);
  }

  function beginPour(type, ev){
    if(state.transitioning || state.finished || state.overflow || state.pouring || state.used[type]) return;
    if(ev) ev.preventDefault();
    ensureAudio();
    state.pouring = type;
    state.pourStart = performance.now();
    state.lastFrame = state.pourStart;
    const btn = type === 'coffee' ? els.coffeeBtn : els.milkBtn;
    btn.classList.add('pouring');
    els.pourStream.className = `pour-stream ${type}`;
    startPourSound(type);
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
    stopPourSound();
    if(state.used.coffee && state.used.milk && !state.overflow){
      setTimeout(finishRound, 280);
    }
  }

  function pourLoop(now){
    if(!state.pouring || state.overflow) return;
    const dt = Math.min(0.033,(now-state.lastFrame)/1000);
    state.lastFrame = now;
    const data = ROUND_DATA[state.round];
    const elapsed = (now-state.pourStart)/1000;
    // Smooth deterministic pulse; no per-frame randomness = less jitter and fairer timing.
    const pulse = 1 + Math.sin(elapsed*6.2)*data.wobble;
    state[state.pouring] += data.rate * pulse * dt;

    if(totalVolume() > 1){
      triggerOverflow();
      return;
    }

    render();
    updatePourSound();
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
    stopPourSound();
    render();
    playOverflow();
    showToast('OVERFLOW!\n0 POINT',1000);
    setTimeout(finishRound,1050);
  }

  function finishRound(){
    if(state.finished && !state.overflow) return;
    state.finished = true;
    stopPourSound();
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

  function animateToNextRound(){
    if(state.transitioning) return;
    state.transitioning = true;
    setControlsEnabled(false);
    els.vessel.classList.add('slide-exit');
    playTransition();

    setTimeout(()=>{
      state.round++;
      setupRound({animate:true});
    }, 390);
  }

  function nextRound(){
    els.resultModal.classList.remove('open');
    if(state.round >= ROUND_DATA.length-1){
      showFinal();
      return;
    }
    animateToNextRound();
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
    setupRound({animate:true});
    playTransition();
  }

  function bindHoldButton(btn,type){
    btn.addEventListener('pointerdown',(e)=>{
      if(btn.disabled) return;
      btn.setPointerCapture?.(e.pointerId);
      beginPour(type,e);
    });
    btn.addEventListener('pointerup',(e)=>endPour(type,e));
    btn.addEventListener('pointercancel',(e)=>endPour(type,e));
    btn.addEventListener('lostpointercapture',(e)=>endPour(type,e));
    btn.addEventListener('contextmenu',(e)=>e.preventDefault());
  }

  // ---------- Web Audio ----------
  function ensureAudio(){
    if(!state.soundOn) return;
    if(!state.audio){
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return;
      state.audio = new Ctx();
      createNoiseBuffer();
      startMusic();
    }
    if(state.audio.state === 'suspended') state.audio.resume();
  }

  function createNoiseBuffer(){
    if(!state.audio || state.noiseBuffer) return;
    const ctx = state.audio;
    const length = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1,length,ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for(let i=0;i<length;i++){
      const white = Math.random()*2-1;
      last = last*0.78 + white*0.22;
      data[i] = last;
    }
    state.noiseBuffer = buffer;
  }

  function tone(freq,dur=0.08,type='sine',gain=0.04,when=0){
    if(!state.soundOn || !state.audio) return;
    const ctx = state.audio;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001,ctx.currentTime+when);
    g.gain.exponentialRampToValueAtTime(gain,ctx.currentTime+when+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+when+dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime+when);
    o.stop(ctx.currentTime+when+dur+.02);
  }

  function noiseBurst(dur=0.16,gain=0.04,highpass=500){
    if(!state.soundOn || !state.audio) return;
    const ctx = state.audio;
    const buffer = ctx.createBuffer(1,Math.floor(ctx.sampleRate*dur),ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type='highpass';
    f.frequency.value=highpass;
    const g = ctx.createGain();
    g.gain.value=gain;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  }

  function startPourSound(type){
    if(!state.soundOn || !state.audio) return;
    stopPourSound();
    const ctx = state.audio;

    // No ordinary pouring noise. A quiet tonal cue fades in only near the brim.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 175;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001,ctx.currentTime);

    osc.connect(master).connect(ctx.destination);
    osc.start();
    state.pourAudio = { master, osc };
    updatePourSound();
  }

  function updatePourSound(){
    const p = state.pourAudio;
    if(!p || !state.audio) return;
    const ctx = state.audio;
    const fill = clamp(fillRatio(),0,0.999);

    // Preserve the rising-pitch fullness cue, but keep the game silent below ~68% fill.
    const pitch = 175 + 1225 * Math.pow(fill,2.25);
    p.osc.frequency.setTargetAtTime(pitch,ctx.currentTime,0.025);

    const threshold = 0.68;
    const near = clamp((fill-threshold)/(1-threshold),0,1);
    const gain = near <= 0 ? 0.0001 : 0.006 + 0.020*Math.pow(near,1.45);
    p.master.gain.setTargetAtTime(gain,ctx.currentTime,0.035);
  }

  function stopPourSound(){
    const p = state.pourAudio;
    if(!p || !state.audio) return;
    const ctx = state.audio;
    try{
      p.master.gain.cancelScheduledValues(ctx.currentTime);
      p.master.gain.setTargetAtTime(0.0001,ctx.currentTime,0.015);
      p.osc.stop(ctx.currentTime+0.07);
    }catch(_){ }
    state.pourAudio = null;
  }

  function playPourStop(){
    // Intentionally silent. Fullness feedback is provided only while nearing the brim.
  }

  function playOverflow(){
    noiseBurst(.35,.09,260);
    tone(92,.36,'sawtooth',.05);
    tone(68,.45,'square',.022,.04);
  }

  function playResult(score){
    const good = score/10000;
    tone(440,.12,'triangle',.035);
    tone(550+good*140,.13,'triangle',.035,.09);
    tone(660+good*190,.18,'triangle',.04,.18);
  }

  function playTransition(){
    tone(390,.07,'sine',.018);
    tone(520,.09,'sine',.018,.065);
  }

  function playFinal(rank){
    const seq = rank==='S'?[523,659,784,1047]:[392,494,587,784];
    seq.forEach((f,i)=>tone(f,.18,'triangle',.04,i*.11));
  }

  function startMusic(){
    if(state.musicTimer || !state.soundOn || !state.audio) return;
    const melody = [261.6,329.6,392,329.6,293.7,349.2,440,349.2];
    const bass = [130.8,146.8,164.8,146.8];
    state.musicTimer = setInterval(()=>{
      if(!state.soundOn || !state.audio || state.pouring) return;
      const i = state.musicStep++;
      tone(melody[i%melody.length],.18,'sine',.008);
      if(i%2===0) tone(bass[Math.floor(i/2)%bass.length],.22,'triangle',.006);
      if(i%4===0) noiseBurst(.03,.0035,2600);
    },330);
  }

  function toggleSound(){
    state.soundOn = !state.soundOn;
    els.soundBtn.textContent = state.soundOn ? 'SOUND ON' : 'SOUND OFF';
    els.soundBtn.classList.toggle('off', !state.soundOn);
    if(!state.soundOn) stopPourSound();
    if(state.soundOn){ ensureAudio(); startMusic(); }
  }

  function startGame(){
    ensureAudio();
    els.titleBtn.hidden = false;
    els.startModal.classList.remove('open');
    setupRound({animate:true});
    playTransition();
  }

  function returnToTitle(){
    if(state.pouring) state.pouring = null;
    stopPourSound();
    els.pourStream.className = 'pour-stream hidden';
    els.resultModal.classList.remove('open');
    els.finalModal.classList.remove('open');
    state.round = 0;
    state.total = 0;
    state.roundScores = [];
    state.overflow = false;
    state.finished = false;
    state.transitioning = false;
    setupRound({animate:false});
    els.startModal.classList.add('open');
    els.titleBtn.hidden = true;
  }

  setupRoundIcons();
  bindHoldButton(els.coffeeBtn,'coffee');
  bindHoldButton(els.milkBtn,'milk');
  els.startBtn.addEventListener('click',startGame);
  els.nextBtn.addEventListener('click',nextRound);
  els.retryBtn.addEventListener('click',resetGame);
  els.soundBtn.addEventListener('click',toggleSound);
  els.titleBtn.addEventListener('click',returnToTitle);
  window.addEventListener('blur',()=>{ if(state.pouring) endPour(state.pouring); });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden && state.pouring) endPour(state.pouring); });

  // Prepare the first screen without animation while the start modal is visible.
  setupRound({animate:false});
})();

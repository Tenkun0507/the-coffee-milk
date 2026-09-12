(() => {
  'use strict';

  const $ = (q) => document.querySelector(q);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  const els = {
    titleScreen: $('#titleScreen'), gameScreen: $('#gameScreen'), finalScreen: $('#finalScreen'),
    startBtn: $('#startBtn'), titleBtn: $('#titleBtn'), finalTitleBtn: $('#finalTitleBtn'),
    soundBtn: $('#soundBtn'), finalSoundBtn: $('#finalSoundBtn'),
    targetSwatch: $('#targetSwatch'), roundLabel: $('#roundLabel'), totalScore: $('#totalScore'),
    coffeeBtn: $('#coffeeBtn'), milkBtn: $('#milkBtn'), vesselArea: $('#vesselArea'), vesselCanvas: $('#vesselCanvas'),
    vesselArt: $('#vesselArt'), liquidMask: $('#liquidMask'), liquid: $('#liquid'), pourStream: $('#pourStream'),
    resultOverlay: $('#resultOverlay'), resultEyebrow: $('#resultEyebrow'), resultTitle: $('#resultTitle'),
    colorScore: $('#colorScore'), volumeScore: $('#volumeScore'), roundScore: $('#roundScore'), resultNote: $('#resultNote'), nextBtn: $('#nextBtn'),
    finalScore: $('#finalScore'), roundBreakdown: $('#roundBreakdown'), againBtn: $('#againBtn')
  };

  // Same physical flow rate in every round. The different vessel capacities make
  // narrow containers fill visually faster, as they should.
  const FLOW_ML_PER_SECOND = 23;
  const ROUNDS = [
    { key:'beaker', name:'BEAKER', asset:'assets/beaker_game.svg', capacity:100, geometry:'linear', blind:false },
    { key:'straight', name:'STRAIGHT GLASS', asset:'assets/straight_glass_game.svg', capacity:88, geometry:'linear', blind:false },
    { key:'test', name:'TEST TUBE', asset:'assets/test_tube_game.svg', capacity:40, geometry:'linear', blind:false },
    { key:'cocktail', name:'COCKTAIL GLASS', asset:'assets/cocktail_glass_game.svg', capacity:118, geometry:'cone', blind:false },
    { key:'opaque', name:'BLIND GLASS', asset:'assets/opaque_glass_game.svg', capacity:90, geometry:'linear', blind:true }
  ];

  const COFFEE_RGB = [70, 38, 25];
  const MILK_RGB = [246, 233, 199];

  let state = null;
  let raf = 0;
  let lastTime = 0;
  let activePour = null;
  let soundOn = true;
  let audio = null;
  let warningOsc = null;
  let warningGain = null;
  let musicTimer = 0;
  let musicStep = 0;

  function freshState() {
    return { round:0, totalScore:0, results:[], target:50, coffee:0, milk:0, overflow:false, used:{coffee:false,milk:false}, locked:false, roundFinished:false };
  }

  function showScreen(which) {
    [els.titleScreen, els.gameScreen, els.finalScreen].forEach(x => x.classList.remove('active'));
    which.classList.add('active');
  }

  function mixColor(coffeePercent) {
    const t = clamp(coffeePercent / 100, 0, 1);
    const v = MILK_RGB.map((m, i) => Math.round(m + (COFFEE_RGB[i] - m) * t));
    return `rgb(${v[0]},${v[1]},${v[2]})`;
  }

  function setTarget() {
    state.target = Math.floor(Math.random() * 81) + 10; // 10–90 inclusive
    els.targetSwatch.style.background = mixColor(state.target);
  }

  function currentRound() { return ROUNDS[state.round]; }
  function totalMl() { return state.coffee + state.milk; }
  function fillRatio() { return totalMl() / currentRound().capacity; }
  function coffeePercent() { const t = totalMl(); return t <= 0 ? 0 : (state.coffee / t) * 100; }

  function visualFillRatio() {
    const f = clamp(fillRatio(), 0, 1);
    return currentRound().geometry === 'cone' ? Math.cbrt(f) : f;
  }

  function updateLiquid() {
    const total = totalMl();
    const ratio = total > 0 ? (state.coffee / total) * 100 : 50;
    els.liquid.style.backgroundColor = mixColor(ratio);
    els.liquid.style.height = `${visualFillRatio() * 100}%`;
  }

  function prepareRound(initial = false) {
    stopPour();
    const r = currentRound();
    state.coffee = 0; state.milk = 0; state.overflow = false; state.locked = false; state.roundFinished = false;
    state.used = { coffee:false, milk:false };
    setTarget();
    els.roundLabel.textContent = `ROUND ${state.round + 1} / ${ROUNDS.length}`;
    els.totalScore.textContent = fmt(state.totalScore);
    els.coffeeBtn.classList.remove('used','pouring'); els.milkBtn.classList.remove('used','pouring');
    els.coffeeBtn.disabled = false; els.milkBtn.disabled = false;
    els.vesselCanvas.className = `vessel-canvas ${r.key}`;
    els.vesselArt.src = r.asset;
    els.liquid.style.height = '0%';
    els.liquidMask.style.visibility = r.blind ? 'hidden' : 'visible';
    els.resultOverlay.classList.remove('show'); els.resultOverlay.setAttribute('aria-hidden','true');
    els.nextBtn.textContent = state.round === ROUNDS.length - 1 ? 'FINAL RESULT' : 'NEXT ROUND';

    if (!initial) {
      els.vesselCanvas.classList.add('enter');
      requestAnimationFrame(() => requestAnimationFrame(() => els.vesselCanvas.classList.remove('enter')));
    }
  }

  function beginGame() {
    state = freshState();
    ensureAudio();
    startMusic();
    showScreen(els.gameScreen);
    prepareRound(true);
  }

  function goTitle() {
    stopPour(); stopMusic(); stopWarning();
    if (state) state.locked = true;
    showScreen(els.titleScreen);
  }

  function beginPour(type, pointerId) {
    if (!state || state.locked || state.overflow || state.used[type] || activePour) return;
    ensureAudio();
    state.used[type] = true;
    const btn = type === 'coffee' ? els.coffeeBtn : els.milkBtn;
    btn.classList.add('used','pouring');
    try { btn.setPointerCapture(pointerId); } catch (_) {}
    activePour = type;
    els.pourStream.className = `pour-stream active ${type}`;
    lastTime = performance.now();
    raf = requestAnimationFrame(tickPour);
    playClick(type);
  }

  function tickPour(now) {
    if (!activePour || state.locked) return;
    const dt = Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    const add = FLOW_ML_PER_SECOND * dt;
    state[activePour] += add;
    updateLiquid();
    const f = fillRatio();
    updateWarning(f);
    if (f > 1.0005) {
      state.overflow = true;
      state.locked = true;
      stopPour();
      playOverflow();
      setTimeout(finishRound, 360);
      return;
    }
    raf = requestAnimationFrame(tickPour);
  }

  function stopPour() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (activePour) {
      const btn = activePour === 'coffee' ? els.coffeeBtn : els.milkBtn;
      btn.classList.remove('pouring');
    }
    activePour = null;
    els.pourStream.className = 'pour-stream';
    stopWarning();
    if (state && !state.locked && state.used.coffee && state.used.milk) {
      state.locked = true;
      setTimeout(finishRound, 250);
    }
  }

  function scoreRound() {
    if (state.overflow) return { color:0, volume:0, points:0, actual:coffeePercent(), fill:fillRatio() };
    const actual = coffeePercent();
    const error = Math.abs(actual - state.target) / 100;
    // Strong nonlinear color accuracy curve: small misses are forgiven, large misses collapse quickly.
    const color = totalMl() <= 0 ? 0 : 100 * Math.exp(-34 * error * error);
    // Nonlinear volume curve: the last few percent are worth a lot.
    const f = clamp(fillRatio(), 0, 1);
    const volume = 100 * Math.pow(f, 6);
    // Maximum 5,000 per round / 25,000 total.
    const points = Math.round((color * volume) / 2);
    return { color, volume, points, actual, fill:f };
  }

  function finishRound() {
    if (!state || !state.locked || state.roundFinished) return;
    state.roundFinished = true;
    const s = scoreRound();
    state.totalScore += s.points;
    state.results[state.round] = s;
    els.totalScore.textContent = fmt(state.totalScore);
    els.resultEyebrow.textContent = `ROUND ${state.round + 1}`;
    els.resultTitle.textContent = state.overflow ? 'OVERFLOW' : 'RESULT';
    els.colorScore.textContent = state.overflow ? '0' : Math.round(s.color);
    els.volumeScore.textContent = state.overflow ? '0' : Math.round(s.volume);
    els.roundScore.textContent = fmt(s.points);
    if (state.overflow) els.resultNote.textContent = 'The cup overflowed. This round scores zero.';
    else if (s.points >= 4500) els.resultNote.textContent = 'Almost perfect.';
    else if (s.points >= 3200) els.resultNote.textContent = 'Great mix. Push the fill level a little further.';
    else if (s.color < 55) els.resultNote.textContent = 'The color was the biggest miss.';
    else if (s.volume < 55) els.resultNote.textContent = 'Good color. A fuller cup would score much higher.';
    else els.resultNote.textContent = 'Good balance. Precision is everything.';
    els.resultOverlay.classList.add('show'); els.resultOverlay.setAttribute('aria-hidden','false');
    if (!state.overflow && s.points > 0) playResult(s.points);
  }

  function nextRound() {
    els.resultOverlay.classList.remove('show');
    if (state.round >= ROUNDS.length - 1) { showFinal(); return; }
    els.vesselCanvas.classList.add('exit');
    setTimeout(() => {
      state.round++;
      prepareRound(false);
    }, 300);
  }

  function showFinal() {
    stopPour(); stopMusic();
    showScreen(els.finalScreen);
    els.finalScore.textContent = fmt(state.totalScore);
    els.roundBreakdown.innerHTML = state.results.map((r, i) => `<div><span>R${i+1}</span><b>${fmt(r.points)}</b></div>`).join('');
    els.finalSoundBtn.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
  }

  function ensureAudio() {
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio = new Ctx();
    }
    if (audio.state === 'suspended') audio.resume().catch(()=>{});
  }

  function tone(freq, dur=.08, gain=.035, type='sine', when=0) {
    if (!soundOn || !audio) return;
    const t = audio.currentTime + when;
    const o = audio.createOscillator(); const g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t+.012); g.gain.exponentialRampToValueAtTime(.0001, t+dur);
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t+dur+.03);
  }

  function playClick(type) { tone(type === 'coffee' ? 180 : 250, .055, .018, 'triangle'); }
  function playOverflow() { tone(170,.16,.05,'sawtooth'); tone(105,.23,.045,'sawtooth',.09); }
  function playResult(points) { const high = points > 4200; tone(high?523:392,.09,.032,'triangle'); tone(high?659:494,.11,.03,'triangle',.08); tone(high?784:587,.14,.025,'triangle',.16); }

  function updateWarning(fill) {
    if (!soundOn || !audio || fill < .74 || !activePour) { stopWarning(); return; }
    if (!warningOsc) {
      warningOsc = audio.createOscillator(); warningGain = audio.createGain();
      warningOsc.type = 'sine'; warningGain.gain.value = .018;
      warningOsc.connect(warningGain); warningGain.connect(audio.destination); warningOsc.start();
    }
    const p = clamp((fill - .74) / .26, 0, 1);
    warningOsc.frequency.setTargetAtTime(330 + Math.pow(p,1.7)*1250, audio.currentTime, .02);
    warningGain.gain.setTargetAtTime(.012 + p*.018, audio.currentTime, .02);
  }

  function stopWarning() {
    if (warningOsc) { try { warningOsc.stop(); } catch(_){} warningOsc.disconnect(); warningOsc = null; }
    if (warningGain) { warningGain.disconnect(); warningGain = null; }
  }

  function startMusic() {
    if (!soundOn) return;
    ensureAudio();
    stopMusic();
    musicStep = 0;
    const seq = [261.63,329.63,392,329.63,293.66,349.23,440,349.23];
    const play = () => {
      if (!soundOn || !audio || !els.gameScreen.classList.contains('active')) return;
      const f = seq[musicStep % seq.length];
      tone(f,.34,.009,'triangle');
      if (musicStep % 4 === 0) tone(f/2,.42,.006,'sine',.02);
      musicStep++;
    };
    play(); musicTimer = window.setInterval(play, 620);
  }

  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = 0; }

  function toggleSound() {
    soundOn = !soundOn;
    els.soundBtn.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    els.finalSoundBtn.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    els.soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) { ensureAudio(); if (els.gameScreen.classList.contains('active')) startMusic(); }
    else { stopWarning(); stopMusic(); }
  }

  function bindPour(btn, type) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); beginPour(type, e.pointerId); });
    btn.addEventListener('pointerup', e => { e.preventDefault(); stopPour(); });
    btn.addEventListener('pointercancel', stopPour);
    btn.addEventListener('lostpointercapture', () => { if (activePour === type) stopPour(); });
  }

  // Prevent double-tap zoom / long-press selection on game controls.
  document.addEventListener('contextmenu', e => { if (e.target.closest('button')) e.preventDefault(); });
  document.addEventListener('dblclick', e => e.preventDefault(), {passive:false});

  bindPour(els.coffeeBtn, 'coffee'); bindPour(els.milkBtn, 'milk');
  els.startBtn.addEventListener('click', beginGame);
  els.againBtn.addEventListener('click', beginGame);
  els.nextBtn.addEventListener('click', nextRound);
  els.titleBtn.addEventListener('click', goTitle); els.finalTitleBtn.addEventListener('click', goTitle);
  els.soundBtn.addEventListener('click', toggleSound); els.finalSoundBtn.addEventListener('click', toggleSound);

  // Stop a held pour if the pointer is released outside the button or the tab loses focus.
  window.addEventListener('pointerup', () => { if (activePour) stopPour(); });
  window.addEventListener('blur', () => { if (activePour) stopPour(); });
})();

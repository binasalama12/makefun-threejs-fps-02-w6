// DOM HUD: health, money, round, timer, ammo, team score, kill feed, the buy
// menu, and the start / pause / scoreboard overlays. All presentation lives
// here; game state stays in main.js and is pushed in through these setters.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const hp = el('hp-value'), hpBar = el('hp-bar');
  const money = el('money-value'), ammoMag = el('ammo-mag'), ammoReserve = el('ammo-reserve');
  const ammoBox = el('ammo'), weaponName = el('weapon-name');
  const roundEl = el('round-value'), timerEl = el('timer-value');
  const scoreEl = el('score-value'), phaseEl = el('phase-line');
  const feed = el('feed'), banner = el('banner'), hint = el('hint');
  const hitmarker = el('hitmarker'), damageVignette = el('damage-vignette');
  const overlay = el('overlay'), overlayTitle = el('overlay-title'), overlayCopy = el('overlay-copy');
  const buyPanel = el('buy-panel'), buyList = el('buy-list'), buyMoney = el('buy-money');
  const scorePanel = el('score-panel'), scoreRows = el('score-rows');
  const plantBar = el('plant-bar'), plantFill = el('plant-fill'), plantLabel = el('plant-label');
  let hitTimer = 0, bannerTimer = 0;

  function fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHp(v) {
      hp.textContent = String(Math.max(0, Math.ceil(v)));
      hpBar.style.width = `${Math.max(0, v)}%`;
      hpBar.style.background = v > 35 ? 'var(--ally)' : 'var(--enemy)';
    },
    setMoney(v) { money.textContent = `$${v}`; },
    setAmmo(mag, reserve, name) {
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setRound(current, total, allyScore, enemyScore) {
      roundEl.textContent = `Round ${current} / ${total}`;
      scoreEl.innerHTML = `Wardens <b>${allyScore}</b> — <b>${enemyScore}</b> Rustjackals`;
    },
    setTimer(sec) { timerEl.textContent = fmtTime(sec); },
    setPhase(text) { phaseEl.textContent = text; },
    setHint(text) { hint.textContent = text || ''; hint.style.opacity = text ? '1' : '0'; },
    hitMarker(kill) {
      hitmarker.classList.add('on');
      hitmarker.style.color = kill ? 'var(--enemy)' : 'var(--ink)';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), kill ? 260 : 110);
    },
    hurtFlash() {
      damageVignette.style.opacity = '1';
      setTimeout(() => { damageVignette.style.opacity = '0'; }, 130);
    },
    banner(text, sub = '') {
      banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
      banner.style.opacity = '1';
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.style.opacity = '0'; }, 2600);
    },
    feedLine(text) {
      const div = document.createElement('div');
      div.textContent = text;
      feed.appendChild(div);
      while (feed.children.length > 5) feed.removeChild(feed.firstChild);
      setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5200);
    },
    clearFeed() { feed.innerHTML = ''; },
    showPlant(progress, label) {
      plantBar.style.display = 'block';
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    hidePlant() { plantBar.style.display = 'none'; },
    showBuy(items, moneyNow) {
      buyPanel.hidden = false;
      buyMoney.textContent = `$${moneyNow}`;
      buyList.innerHTML = '';
      items.forEach((item, i) => {
        const row = document.createElement('div');
        row.className = `buy-row${item.owned ? ' owned' : ''}${!item.owned && !item.affordable ? ' poor' : ''}`;
        row.innerHTML = `<kbd>${i + 1}</kbd><span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">${item.owned ? 'OWNED' : `$${item.price}`}</span>`;
        buyList.appendChild(row);
      });
    },
    hideBuy() { buyPanel.hidden = true; },
    showScoreboard(rows, title) {
      scorePanel.hidden = false;
      el('score-title').textContent = title;
      scoreRows.innerHTML = rows.map((r) => `<div class="score-row"><span>${r.label}</span><b>${r.value}</b></div>`).join('');
    },
    hideScoreboard() { scorePanel.hidden = true; },
    showOverlay(kind, data = {}) {
      overlay.hidden = false;
      buyPanel.hidden = true;
      if (kind === 'start') {
        overlayTitle.textContent = 'Dustbowl Relay';
        overlayCopy.textContent = 'Plant the charge on the radio tower, or stop the crew trying. First crew to 5 rounds takes the relay.';
        el('play').textContent = 'Click to play';
      } else if (kind === 'paused') {
        overlayTitle.textContent = 'Paused';
        overlayCopy.textContent = 'The dust waits for no one. Click to jump back in.';
        el('play').textContent = 'Resume';
      } else if (kind === 'matchEnd') {
        overlayTitle.textContent = data.title || 'Match over';
        overlayCopy.textContent = data.copy || '';
        el('play').textContent = 'Play again';
      }
      scorePanel.hidden = kind !== 'matchEnd';
      if (kind === 'matchEnd' && data.rows) {
        el('score-title').textContent = 'Final scoreboard';
        scoreRows.innerHTML = data.rows.map((r) => `<div class="score-row"><span>${r.label}</span><b>${r.value}</b></div>`).join('');
      }
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(cb) { el('play').addEventListener('click', cb); },
  };
}

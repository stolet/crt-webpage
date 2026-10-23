(function () {
  'use strict';
  const { Sorter, DT, DEADLINE, INGRESS, SETUP, OUTPUT, TENANTS, MODES, defaults } = TailContagion;
  const $ = id => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = { bg: '#1D1C30', grid: '#29263C', panel: '#27243A', line: '#514A70', metal: '#89829F',
    light: '#E9E3F7', muted: '#B4ABC9', purple: '#B6A7F6', ink: '#171525', belt: '#343047',
    victim: '#009E73', adversary: '#DC267F', warning: '#FFB000', box: '#CBA476', tape: '#F0D0A1' };
  // Every sprite uses the same two-pixel grid, outline, and palette. Packets
  // retain the same dimensions in the queue, batch, work area, and output.
  const PACKETS = { 64: { w: 20, h: 18 }, 256: { w: 28, h: 24 }, 1024: { w: 40, h: 30 } };
  const GLYPHS = {
    chip: ['.######.', '.#....#.', '##.##.##', '##.##.##', '##.##.##', '##.##.##', '.#....#.', '.######.'],
    clock: ['..####..', '.#....#.', '#..#...#', '#..#...#', '#..###.#', '#......#', '.#....#.', '..####..']
  };
  let config = defaults(), machine = new Sorter(config), playing = true, speed = .2;
  let previous = null, accumulator = 0, lastUI = -1, lastDraw = 0, compact = false, helpWasPlaying = true, lastReceipt = -1;
  const groups = {
    mode: [...document.querySelectorAll('[data-mode]')],
    size: [...document.querySelectorAll('[data-size]')],
    traffic: [...document.querySelectorAll('[data-traffic]')],
    speed: [...document.querySelectorAll('[data-speed]')]
  };
  const utilization = new TailMetricMotion.Counter();
  function liveCounters() {
    const m = machine.metrics();
    $('delivered').textContent = m.delivered;
    $('misses').textContent = m.missed;
    $('miss-detail').textContent = 'of ' + m.arrived + ' Victim packets · ' + DEADLINE + ' µs deadline';
    $('clock').textContent = machine.t.toFixed(2) + ' µs';
    utilization.set(m.utilization);
  }
  function animateMetrics(elapsed) {
    const value = utilization.advance(elapsed);
    $('utilization').textContent = value === null ? '0' : value.toFixed(0);
  }
  function timer(packet, x, y) {
    const age = Math.min(1, Math.max(0, (machine.t - packet.arrived) / DEADLINE));
    rect(x - 14, y, 28, 3, C.line);
    rect(x - 14, y, 28 * age, 3, packet.missedAt !== null ? C.warning : TENANTS[packet.tenant].color);
  }

  function rect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function text(value, x, y, color = C.muted, size = 12, align = 'left') {
    ctx.fillStyle = color; ctx.font = `${size}px "Courier New",monospace`; ctx.textAlign = align;
    ctx.fillText(String(value), Math.round(x), Math.round(y)); ctx.textAlign = 'left';
  }
  function wire(points, color = C.line) {
    // Axis-aligned rectangles avoid fractional strokes and rounded corners.
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1], [x2, y2] = points[i];
      rect(Math.min(x1, x2), Math.min(y1, y2), Math.max(2, Math.abs(x2 - x1)), Math.max(2, Math.abs(y2 - y1)), color);
    }
  }
  function glyph(name, x, y, color) {
    GLYPHS[name].forEach((row, dy) => [...row].forEach((pixel, dx) => { if (pixel === '#') rect(x + dx * 2, y + dy * 2, 2, 2, color); }));
  }
  function frame(x, y, w, h, header) {
    rect(x, y, w, h, C.metal); rect(x + 2, y + 2, w - 4, h - 4, C.ink);
    rect(x + 4, y + 4, w - 8, h - 8, C.panel);
    rect(x + 4, y + 4, w - 8, 32, '#39334F');
    glyph('chip', x + 14, y + 12, C.purple);
    text(header, x + 42, y + 25, C.light, 12);
  }
  function drawPacket(x, baseline, packet) {
    const { w, h } = PACKETS[packet.bytes];
    const missed = packet.missedAt !== null;
    const age = missed ? machine.t - packet.missedAt : Infinity;
    const shake = !reduced && age >= 0 && age < .3 ? Math.round(Math.sin(age * 60) * 2) : 0;
    const left = Math.round(x - w / 2) + shake, top = Math.round(baseline - h);
    rect(left - 2, top - 2, w + 4, h + 4, C.ink);
    rect(left, top, w, h, missed ? C.warning : C.box); rect(left, top, w, 2, C.tape);
    rect(left + w / 2 - 2, top, 4, h, C.tape); rect(left, baseline - 2, w, 2, '#A17C58');
    rect(left + 4, top + 6, 6, 4, TENANTS[packet.tenant].color);
    if (missed) {
      rect(left + 4, top + 5, 4, 6, C.ink); rect(left + 4, top + 13, 4, 2, C.ink);
      if (!reduced && age >= 0 && age < .3) {
        const spread = 3 + Math.floor(age * 12);
        rect(left - spread, top - 3, 2, 2, C.warning);
        rect(left + w + spread - 2, top - 3, 2, 2, C.warning);
      }
    }
  }
  function avatar(x, y, color) {
    // Static sender: square body and the Idle Cycles face, without CPU pins.
    rect(x, y, 52, 46, C.ink);
    rect(x + 4, y + 4, 44, 38, color);
    rect(x + 13, y + 15, 5, 5, C.ink);
    rect(x + 34, y + 15, 5, 5, C.ink);
    rect(x + 23, y + 23, 6, 2, C.ink);
  }
  function belt(x, y, length, active, vertical = false) {
    rect(x, y, vertical ? 12 : length, vertical ? length : 12, C.ink);
    rect(x + 2, y + 2, vertical ? 8 : length - 4, vertical ? length - 4 : 8, C.belt);
    const offset = active && !reduced ? Math.floor(machine.t * 24) % 16 : 0;
    for (let p = 4 + offset; p < length - 4; p += 16) rect(x + (vertical ? 3 : p), y + (vertical ? p : 3), vertical ? 6 : 2, vertical ? 2 : 6, C.line);
  }
  function geometry() {
    if (compact) return { width: 400, height: 680, core: { x: 28, y: 214, w: 344, h: 292 },
      senders: [{ x: 20, y: 22, w: 164 }, { x: 216, y: 22, w: 164 }],
      queues: [{ x: 26, y: 138, w: 152 }, { x: 222, y: 138, w: 152 }],
      output: { x: 140, y: 564, w: 120, h: 92 } };
    return { width: 960, height: 380, core: { x: 380, y: 48, w: 344, h: 292 },
      senders: [{ x: 24, y: 94, w: 148 }, { x: 24, y: 226, w: 148 }],
      queues: [{ x: 194, y: 138, w: 146 }, { x: 194, y: 270, w: 146 }],
      output: { x: 812, y: 164, w: 120, h: 108 } };
  }
  function sender(id, g) {
    const tenant = machine.tenants[id], s = g.senders[id], q = g.queues[id];
    const oldest = tenant.queue[0], late = oldest && machine.t > oldest.deadline;
    rect(s.x, s.y, s.w, 72, C.line); rect(s.x + 2, s.y + 2, s.w - 4, 68, C.panel);
    avatar(s.x + 8, s.y + 12, tenant.color);
    text(tenant.name.toUpperCase(), s.x + 70, s.y + 27, C.light, 12);
    text((id === 0 ? 64 : config.size).toLocaleString() + ' B', s.x + 70, s.y + 47, C.muted, 11);
    belt(q.x, q.y, q.w, tenant.queue.length > 0);
    const incoming = tenant.queue.find(packet => machine.t < packet.readyAt);
    const shown = tenant.queue.filter(packet => packet !== incoming).slice(0, incoming ? 2 : 3);
    if (incoming) shown.push(incoming);
    shown.forEach((packet, i) => {
      const target = q.x + q.w - 24 - i * 46;
      const fraction = Math.min(1, Math.max(0, (machine.t - packet.arrived) / INGRESS));
      const px = packet === incoming ? q.x + 22 + (target - q.x - 22) * fraction : target;
      drawPacket(px, q.y - 2, packet); timer(packet, px, q.y - 44);
    });
    text(tenant.queue.length ? tenant.queue.length + ' WAITING' : 'QUEUE CLEAR', q.x, q.y + 32, late ? C.warning : C.muted, 10);
    const blocked = tenant.queue[0]?.readyAt <= machine.t && !machine.eligible(tenant);
    rect(q.x + q.w + 2, q.y - 34, 4, 46, blocked ? C.adversary : C.victim);
    if (blocked) text(config.mode === 'time' ? 'DEBT' : 'LIMIT', q.x + q.w + 6, q.y + 32, C.adversary, 10, 'right');
  }
  function intakeRoute(g, tenant) {
    const q=g.queues[tenant],c=g.core;
    const destY=config.mode==='dedicated' ? compact ? c.y+tenant*154+89 : q.y+8 : c.y+212;
    const end=[c.x+c.w/2,destY];
    if(compact)return tenant===0
      ? [[q.x+q.w-24,q.y-2],[190,q.y-2],[190,200],[24,200],[24,destY],end]
      : [[q.x+q.w-24,q.y-2],[376,q.y-2],[376,destY],end];
    return [[q.x+q.w-24,q.y-2],[362,q.y-2],[362,destY],end];
  }
  function drawRoutes(g) {
    const c=g.core,o=g.output;
    machine.tenants.forEach((_,id)=>wire(intakeRoute(g,id).map(([x,y])=>[x,y+2])));
    if(compact){const exit=config.mode==='dedicated'?c.y+280:c.y+c.h;belt(194,exit,o.y-exit,true,true);}
    else if(config.mode==='dedicated'){
      g.queues.forEach(q=>wire([[c.x+c.w,q.y+16],[756,q.y+16],[756,c.y+216]],C.metal));
      belt(756,c.y+210,o.x-756,true);
    }else belt(c.x+c.w+2,c.y+210,o.x-c.x-c.w-2,true);
  }
  function along(points, progress) {
    const lengths = points.slice(1).map((p,i) => Math.abs(p[0]-points[i][0])+Math.abs(p[1]-points[i][1]));
    let distance = Math.min(1, Math.max(0,progress)) * lengths.reduce((a,b)=>a+b,0);
    for (let i=0;i<lengths.length;i++) {
      if (distance <= lengths[i] || i===lengths.length-1) {
        const f = lengths[i] ? distance/lengths[i] : 0;
        return [points[i][0]+(points[i+1][0]-points[i][0])*f,points[i][1]+(points[i+1][1]-points[i][1])*f];
      }
      distance -= lengths[i];
    }
    return points[0];
  }
  function intake(g) {
    machine.workers.forEach((worker,id) => {
      const job=worker.job;
      if (!job || job.stages[job.stage].kind !== 'setup') return;
      const c=g.core;
      job.items.forEach((item,i) => {
        const packet=item.packet,q=g.queues[packet.tenant];
        const duration=SETUP*2/(job.items.length+1), delay=i*SETUP/(job.items.length+1);
        const progress=(job.elapsed-delay)/duration;
        if(progress<0 || progress>=1)return;
        const [x,y]=along(intakeRoute(g,packet.tenant),progress);
        drawPacket(x,y,packet);

      });
    });
  }
  function phase(worker) {
    const job = worker.job, stage = job && job.stages[job.stage];
    return { job, stage, item: stage && stage.item >= 0 ? job.items[stage.item] : null,
      progress: stage ? Math.min(1, job.elapsed / stage.duration) : 0 };
  }
  function scanner(x, y, progress, color) {
    rect(x - 38, y, 76, 4, C.metal); rect(x - 38, y + 4, 4, 12, C.metal); rect(x + 34, y + 4, 4, 12, C.metal);
    const scanX = reduced ? x : x - 24 + Math.floor(progress * 24) * 2;
    rect(scanX, y + 12, 2, 46, color);
  }
  function stamp(x, y, progress, color, contactY) {
    const travel = Math.max(0, contactY - y - 34);
    const drop = Math.round((reduced ? travel / 2 : Math.sin(progress * Math.PI) * travel) / 2) * 2;
    rect(x - 6, y, 12, 12, C.metal); rect(x - 2, y + 12, 4, 16 + drop, C.metal);
    rect(x - 16, y + 28 + drop, 32, 6, color);
  }
  function core(worker, c) {
    const { job, stage, item, progress } = phase(worker);
    const center = c.x + c.w / 2, baseline = c.y + 212;
    frame(c.x, c.y, c.w, c.h, 'DATAPATH CORE');
    // Batch inventory, processing area, and status each own a fixed rectangle.
    text('BATCH', c.x + 18, c.y + 60, C.muted, 11);
    text(job ? job.items.length + (job.items.length === 1 ? ' PACKET' : ' PACKETS') : 'EMPTY', c.x + c.w - 18, c.y + 60, C.muted, 11, 'right');
    const slots = config.batch, slotWidth = 54, start = center - slots * slotWidth / 2;
    for (let i = 0; i < slots; i++) {
      const sx = start + i * slotWidth;
      const current = stage && stage.item === i;
      rect(sx + 3, c.y + 72, slotWidth - 6, 40, current ? C.purple : C.line);
      rect(sx + 5, c.y + 74, slotWidth - 10, 36, C.ink);
      if (job && job.items[i] && (stage.kind !== 'setup' || job.elapsed >= SETUP*(i+2)/(job.items.length+1))) {
        drawPacket(sx + slotWidth / 2, c.y + 106, job.items[i].packet);
        timer(job.items[i].packet, sx + slotWidth / 2, c.y + 66);
      }
    }
    const drawersX = c.x + 20, drawersY = c.y + 142;
    const inspect = stage && stage.kind === 'inspect';
    for (let i = 0; i < 6; i++) {
      const dx = drawersX + i % 3 * 16, dy = drawersY + Math.floor(i / 3) * 16;
      const highlighted = inspect && i === stage.pass % 6;
      rect(dx, dy, 12, 12, highlighted ? C.warning : C.line); rect(dx + 4, dy + 4, 4, 2, C.ink);
    }
    text('LOOKUP', drawersX + 22, drawersY + 48, inspect ? C.warning : C.muted, 10, 'center');
    const clockX = c.x + c.w - 58;
    glyph('clock', clockX, c.y + 144, C.purple);
    const elapsed = job ? job.stages.slice(0, job.stage).reduce((sum, s) => sum + s.duration, 0) + job.elapsed : 0;
    text(elapsed.toFixed(2) + ' µs', clockX + 8, c.y + 187, C.muted, 10, 'center');
    belt(c.x + 16, baseline + 2, c.w - 32, !!job);
    if (item) {
      drawPacket(center, baseline, item.packet); timer(item.packet, center, c.y + 124);
      if (['identify', 'scan', 'copy'].includes(stage.kind)) scanner(center, c.y + 140, progress, C.purple);
      if (inspect) {
        if (progress < .55) scanner(center, c.y + 140, progress / .55, C.warning);
        else stamp(center, c.y + 140, (progress - .55) / .45, C.warning, baseline - PACKETS[item.packet.bytes].h);
      }
      if (stage.kind === 'stamp') stamp(center, c.y + 140, progress, C.victim, baseline - PACKETS[item.packet.bytes].h);
      text(TENANTS[item.packet.tenant].name.toUpperCase(), center, c.y + 244, TENANTS[item.packet.tenant].color, 11, 'center');
    } else if (!job) text('READY', center, c.y + 190, C.muted, 11, 'center');
    rect(c.x + 16, c.y + 258, c.w - 32, 22, C.ink);
    text(stage ? stage.name.toUpperCase() : 'WAITING FOR PACKETS', center, c.y + 273, inspect ? C.warning : C.purple, 11, 'center');
    rect(c.x + 16, c.y + 284, c.w - 32, 2, C.line);
    if (job) rect(c.x + 16, c.y + 284, (c.w - 32) * elapsed / job.total, 2, C.purple);
  }
  function dedicated(g) {
    const positions = compact ? [g.core.y, g.core.y + 154] : g.queues.map(q => q.y - 81);
    machine.workers.forEach((worker, id) => {
      const x = g.core.x, y = positions[id], w = g.core.w;
      const { job, stage, item } = phase(worker);
      frame(x, y, w, 126, 'DATAPATH CORE ' + (id + 1));
      text('BATCH', x + 16, y + 57, C.muted, 10);
      text(job ? job.items.length + (job.items.length === 1 ? ' PACKET' : ' PACKETS') : 'EMPTY', x + w - 16, y + 57, C.muted, 10, 'right');
      belt(x + 16, y + 91, w - 32, !!job);
      if (item) { drawPacket(x + w / 2, y + 89, item.packet); timer(item.packet, x + w / 2, y + 42); }
      text(stage ? stage.name.toUpperCase() : 'RESERVED, IDLE', x + w / 2, y + 115, stage ? C.purple : C.muted, 10, 'center');
    });
  }
  function output(g) {
    const o = g.output, c = g.core;
    // Delivery animations are painted before the bin, which occludes arrivals
    // rather than letting them float over the label or delivered count.
    machine.events.forEach(event => {
      const age = machine.t - event.visualAt;
      if (age < 0 || age >= OUTPUT || event.delivered) return;
      const p = age / OUTPUT;
      let x, y;
      if (compact) { x = 200; y = c.y + c.h + 34 + (o.y - c.y - c.h - 34) * p; }
      else { const end = o.x - PACKETS[event.packet.bytes].w / 2 - 2; x = c.x + c.w + 24 + (end - c.x - c.w - 24) * p; y = c.y + 210; }
      drawPacket(x, y, event.packet); timer(event.packet, x, y - 44);
    });
    rect(o.x, o.y, o.w, o.h, C.metal); rect(o.x + 2, o.y + 2, o.w - 4, o.h - 4, C.ink);
    rect(o.x + 4, o.y + 4, o.w - 8, o.h - 8, C.panel);
    text('DELIVERED', o.x + o.w / 2, o.y + 28, C.muted, 12, 'center');
    text(machine.tenants.reduce((sum, tenant) => sum + tenant.delivered, 0), o.x + o.w / 2, o.y + 57, C.light, 22, 'center');
    rect(o.x + 18, o.y + o.h - 23, o.w - 36, 10, C.ink);
    rect(o.x + 20, o.y + o.h - 21, o.w - 40, 2, C.line);
  }
  function draw() {
    const g = geometry(); ctx.imageSmoothingEnabled = false;
    rect(0, 0, g.width, g.height, C.bg);
    for (let x = 0; x < g.width; x += 12) for (let y = 0; y < g.height; y += 12) rect(x, y, 1, 1, C.grid);
    drawRoutes(g);
    machine.tenants.forEach((_, id) => sender(id, g));
    if (config.mode === 'dedicated') dedicated(g); else core(machine.workers[0], g.core);
    intake(g); output(g); liveCounters();
  }
  function layout() {
    compact = canvas.parentElement.clientWidth <= 600;
    const g = geometry(); canvas.width = g.width; canvas.height = g.height; draw();
  }
  function syncChoices() {
    Object.entries(groups).forEach(([name, buttons]) => buttons.forEach(button => {
      const selected = String(name === 'speed' ? speed : config[name]) === button.dataset[name];
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    }));
    $('inspection').value = String(config.extra); $('inspection-value').value = config.extra + (config.extra === 1 ? ' check' : ' checks');
    $('allowance').value = String(config.allowance);
    const rateLimited = ['packets', 'bytes'].includes(config.mode);
    const timeBudget = config.mode === 'time';
    $('allowance-setting').hidden = !rateLimited;
    $('cap-setting').hidden = !timeBudget;
    $('period-setting').hidden = !timeBudget;
    $('budget-hint').hidden = config.mode === 'dedicated';
    $('allowance').disabled = !rateLimited;
    $('allowance-value').value = config.mode === 'packets' ? config.allowance.toFixed(2) + ' packets / µs'
      : config.mode === 'bytes' ? Math.round(config.allowance * 256) + ' B / µs'
      : config.mode === 'time' ? (config.allowance * .75).toFixed(2) + ' CPU µs / µs' : 'Unrestricted';
    $('policy-description').textContent = MODES[config.mode].description;
    $('cap').value = String(config.cap); $('refill-period').value = String(config.period);
    $('cap').disabled = !timeBudget; $('refill-period').disabled = !timeBudget;
    $('cap-value').value = machine.cap().toFixed(config.mode === 'time' ? 2 : 0) + (config.mode === 'time' ? ' CPU µs' : config.mode === 'bytes' ? ' B' : ' packets');
    $('period-value').value = config.period.toFixed(2) + ' µs';
    $('budget-hint').textContent = config.mode === 'time' ? 'The cap limits saved CPU credit. Refills arrive periodically; longer periods or larger caps allow more interference.'
      : config.mode === 'bytes' ? 'A 1,024 B packet costs 16 times as many byte tokens as a 64 B packet.'
      : config.mode === 'packets' ? 'Every packet costs one token. Extra processing consumes no extra tokens.' : 'Choose a rate limit or time budget to set an allowance.';
    canvas.setAttribute('aria-label', `${config.mode === 'dedicated' ? 'Two dedicated datapath cores' : 'One shared datapath core'} serving Victim and Adversary. Adversary sends ${config.size} byte packets with ${config.extra} extra checks. ${MODES[config.mode].name} policy.`);
  }
  function updateUI() {
    liveCounters();
    $('play-icon').className = 'icon ' + (playing ? 'icon-pause' : 'icon-play');
    $('pause').setAttribute('aria-label', playing ? 'Pause simulation' : 'Resume simulation');
    $('pause').setAttribute('aria-pressed', String(!playing));
    if (machine.receipt && machine.receipt.number !== lastReceipt) {
      const r = machine.receipt; lastReceipt = r.number;
      $('receipt-number').textContent = '#' + String(r.number).padStart(3, '0'); $('receipt').replaceChildren();
      const summary = document.createElement('span');
      summary.textContent = `${r.count} ${r.count === 1 ? 'packet' : 'packets'} · ${r.bytes.toLocaleString()} B · ${r.cpu.toFixed(2)} CPU µs`;
      $('receipt').append(summary);
      r.perTenant.forEach((cost, i) => {
        if (!cost) return;
        const entry = document.createElement('span'); entry.className = i === 0 ? 'bill-victim' : 'bill-adversary';
        entry.textContent = ` · ${TENANTS[i].name} ${cost.toFixed(2)} µs`; $('receipt').append(entry);
      });
    }
    lastUI = machine.t;
  }
  function restart() {
    machine = new Sorter({ ...config,
      allowance: config.mode === 'time' ? defaults().allowance : config.allowance,
      cap: config.mode === 'time' ? config.cap : defaults().cap,
      period: config.mode === 'time' ? config.period : defaults().period
    }); accumulator = 0; previous = null; lastUI = -1; lastReceipt = -1;
    $('receipt-number').textContent = '—'; $('receipt').textContent = 'Waiting for a completed batch.';
    utilization.value = utilization.target = null;
    syncChoices(); updateUI(); draw(); animateMetrics(0);
    $('announcement').textContent = `${MODES[config.mode].name}. Simulation restarted.`;
  }
  function setPlaying(value) { playing = value; previous = null; accumulator = 0; updateUI(); draw(); }
  Object.entries(groups).forEach(([name, buttons]) => buttons.forEach(button => button.addEventListener('click', () => {
    if (name === 'speed') { speed = Number(button.dataset.speed); previous = null; syncChoices(); return; }
    config[name] = name === 'size' ? Number(button.dataset[name]) : button.dataset[name]; restart();
  })));
  $('inspection').addEventListener('input', event => { config.extra = Number(event.target.value); restart(); });
  $('allowance').addEventListener('input', event => { config.allowance = Number(event.target.value); restart(); });
  $('cap').addEventListener('input', event => { config.cap = Number(event.target.value); restart(); });
  $('refill-period').addEventListener('input', event => { config.period = Number(event.target.value); restart(); });
  $('pause').addEventListener('click', () => setPlaying(!playing));
  $('reset').addEventListener('click', restart);
  $('step').addEventListener('click', () => {
    setPlaying(false);
    const initial = machine.workers.map(worker => worker.job ? `${worker.job.started}:${worker.job.stage}` : null);
    for (let i = 0; i < 30 / DT; i++) {
      machine.step();
      if (machine.workers.some((worker, id) => initial[id] !== (worker.job ? `${worker.job.started}:${worker.job.stage}` : null))) break;
    }
    updateUI(); draw();
  });
  $('help-open').addEventListener('click', () => { helpWasPlaying = playing; setPlaying(false); $('help').showModal(); });
  ['help-close', 'help-done'].forEach(id => $(id).addEventListener('click', () => $('help').close()));
  $('help').addEventListener('close', () => setPlaying(helpWasPlaying));
  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || $('help').open || ['INPUT', 'BUTTON', 'A'].includes(document.activeElement.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); setPlaying(!playing); }
    if (event.key.toLowerCase() === 'r') restart();
  });
  document.addEventListener('visibilitychange', () => { previous = null; accumulator = 0; });
  function tick(now) {
    const elapsed = previous === null ? 0 : Math.max(0, Math.min((now - previous) / 1000, .1)); previous = now;
    if (playing && !document.hidden) {
      accumulator += elapsed * speed;
      while (accumulator >= DT) { machine.step(); accumulator -= DT; }
    }
    if (!document.hidden && now - lastDraw >= (reduced ? 200 : 1000 / 30)) { draw(); lastDraw = now; }
    if (machine.t - lastUI >= .1) updateUI();
    if (playing && !document.hidden) animateMetrics(elapsed);
    requestAnimationFrame(tick);
  }
  new ResizeObserver(layout).observe(canvas.parentElement);
  syncChoices(); layout(); updateUI(); animateMetrics(0); requestAnimationFrame(tick);
})();

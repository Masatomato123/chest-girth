/*
 * app.js — 画面描画・操作・グラフ・入出力
 */
(function () {
  'use strict';

  const S = window.Standards;
  const DB = window.Store;

  /* ============ 小道具 ============ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function fmt(n, d) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function download(filename, content, mime) {
    const blob = (content instanceof Blob) ? content
      : new Blob(['\uFEFF' + content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // 充足率の状態区分
  function rateStatus(rate) {
    if (rate == null) return { cls: 'st-none', pill: '', label: '標準式なし' };
    if (rate < 90) return { cls: 'st-low', pill: 'st-low', label: '発育注意' };
    if (rate < 100) return { cls: 'st-caution', pill: 'st-caution', label: 'やや不足' };
    return { cls: 'st-good', pill: 'st-good', label: '標準以上' };
  }
  function cattleSummary(c) {
    return `${S.breedLabel(c.breed)}・${S.sexLabel(c.sex)}　生 ${c.birthDate}`;
  }
  function cattleTitle(c) {
    return c.tag && c.name ? `${c.tag}（${c.name}）` : (c.tag || c.name || '（無名）');
  }

  /* ============ ルーティング ============ */
  const state = { view: 'farms', farmId: null, cattleId: null, chartMode: 'rate' };

  function go(hash) { location.hash = hash; }

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    if (parts[0] === 'farm' && parts[1]) return { view: 'farm', farmId: parts[1] };
    if (parts[0] === 'cattle' && parts[1]) return { view: 'cattle', cattleId: parts[1] };
    if (parts[0] === 'data') return { view: 'data' };
    return { view: 'farms' };
  }

  function route() {
    const r = parseHash();
    closeModal();
    // 妥当性チェック
    if (r.view === 'farm' && !DB.getFarm(r.farmId)) return go('#/');
    if (r.view === 'cattle') {
      const c = DB.getCattle(r.cattleId);
      if (!c) return go('#/');
      state.farmId = c.farmId;
    }
    state.view = r.view;
    if (r.farmId) state.farmId = r.farmId;
    if (r.cattleId) state.cattleId = r.cattleId;

    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + r.view).classList.add('active');
    window.scrollTo(0, 0);

    if (r.view === 'farms') renderFarms();
    else if (r.view === 'farm') renderFarm();
    else if (r.view === 'cattle') renderCattle();
    else if (r.view === 'data') renderData();

    updateBar();
  }

  function updateBar() {
    const back = $('#backBtn'), title = $('#barTitle'), sub = $('#barSub');
    const setTitle = (t, s) => { title.childNodes[0].nodeValue = t; sub.textContent = s; };
    if (state.view === 'farms') {
      back.classList.remove('show');
      setTitle('胸囲充足率レコーダー', '農場を選んでください');
    } else if (state.view === 'farm') {
      back.classList.add('show'); back.onclick = () => go('#/');
      const f = DB.getFarm(state.farmId);
      setTitle(f ? f.name : '農場', '牛を選んでください');
    } else if (state.view === 'cattle') {
      back.classList.add('show');
      const c = DB.getCattle(state.cattleId);
      back.onclick = () => go('#/farm/' + (c ? c.farmId : ''));
      setTitle(c ? cattleTitle(c) : '牛', c ? cattleSummary(c) : '');
    } else if (state.view === 'data') {
      back.classList.add('show'); back.onclick = () => history.length > 1 ? history.back() : go('#/');
      setTitle('データ管理', 'バックアップ・端末間の移行');
    }
  }

  /* ============ 画面: 農場一覧 ============ */
  function renderFarms() {
    const root = $('#view-farms');
    const farms = DB.listFarms();
    root.innerHTML = '';
    root.appendChild(el(`<p class="eyebrow">農場</p>`));

    if (!farms.length) {
      root.appendChild(el(`
        <div class="empty card card--pad">
          <div class="empty__mark">🐄</div>
          <h3>まずは農場を登録</h3>
          <p>右下の「＋ 農場を追加」から始めましょう。<br>登録後に牛の個体をCSVでまとめて取り込めます。</p>
        </div>`));
    } else {
      const list = el(`<div class="stack"></div>`);
      farms.forEach(f => {
        const n = DB.listCattle(f.id).length;
        const row = el(`
          <button class="row" type="button">
            <div class="marker">農場</div>
            <div class="row__main">
              <div class="row__title">${esc(f.name)}</div>
              <div class="row__meta">${f.note ? esc(f.note) + '・' : ''}登録 ${n} 頭</div>
            </div>
            <div class="row__chev">›</div>
          </button>`);
        row.addEventListener('click', () => go('#/farm/' + f.id));
        list.appendChild(row);
      });
      root.appendChild(list);
    }
    setFab('農場を追加', openFarmForm);
  }

  /* ============ 画面: 農場詳細（牛一覧） ============ */
  function renderFarm() {
    const root = $('#view-farm');
    const f = DB.getFarm(state.farmId);
    const cattle = DB.listCattle(f.id);
    root.innerHTML = '';

    // ツールバー
    const tools = el(`
      <div class="btn-row" style="margin-bottom:14px">
        <button class="btn btn--ghost btn--sm" id="btnCsvIn">CSVで一括登録</button>
        <button class="btn btn--ghost btn--sm" id="btnCsvTpl">テンプレート</button>
        <button class="btn btn--ghost btn--sm" id="btnCsvOut">名簿を書き出す</button>
        <button class="btn btn--ghost btn--sm" id="btnEditFarm">農場名を編集</button>
      </div>`);
    root.appendChild(el(`<p class="eyebrow">${esc(f.name)} の牛</p>`));
    root.appendChild(tools);
    $('#btnCsvIn', root).onclick = () => importCattleFlow(f.id);
    $('#btnCsvTpl', root).onclick = downloadTemplate;
    $('#btnCsvOut', root).onclick = () => exportCattleCSV(f);
    $('#btnEditFarm', root).onclick = () => openFarmForm(f);

    root.appendChild(el(`<h2 class="section-title">個体一覧 <span class="count">${cattle.length} 頭</span></h2>`));

    if (!cattle.length) {
      root.appendChild(el(`
        <div class="empty card card--pad">
          <div class="empty__mark">📋</div>
          <h3>牛を登録しましょう</h3>
          <p>「＋ 牛を追加」で1頭ずつ、または上の「CSVで一括登録」でまとめて登録できます。</p>
        </div>`));
    } else {
      const list = el(`<div class="stack"></div>`);
      cattle.forEach(c => {
        const ms = DB.listMeasurements(c.id);
        const last = ms[ms.length - 1];
        let badge = '<div class="row__meta">記録なし</div>';
        if (last) {
          const ev = S.evaluate(c, last.date, last.chest);
          const st = rateStatus(ev.rate);
          const rateTxt = ev.rate == null ? '式なし' : fmt(ev.rate, 1) + '%';
          badge = `<div class="row__meta">最新 ${last.date}・日齢 ${ev.days}・<span class="rate-pill ${st.pill}">${rateTxt}</span></div>`;
        }
        const mk = c.breed === 'holstein' ? 'marker--holstein' : 'marker--wagyu';
        const sexMark = { male: '雄', castrated: '去', female: '雌' }[c.sex] || '';
        const row = el(`
          <button class="row" type="button">
            <div class="marker ${mk}">${sexMark}</div>
            <div class="row__main">
              <div class="row__title">${esc(cattleTitle(c))}</div>
              ${badge}
            </div>
            <div class="row__chev">›</div>
          </button>`);
        row.addEventListener('click', () => go('#/cattle/' + c.id));
        list.appendChild(row);
      });
      root.appendChild(list);
    }
    setFab('牛を追加', () => openCattleForm(f.id));
  }

  /* ============ 画面: 牛詳細 ============ */
  let chart = null;
  function renderCattle() {
    const root = $('#view-cattle');
    const c = DB.getCattle(state.cattleId);
    const ms = DB.listMeasurements(c.id);
    root.innerHTML = '';

    // 個体情報チップ
    root.appendChild(el(`
      <div class="chips">
        <span class="chip">${esc(S.breedLabel(c.breed))}・${esc(S.sexLabel(c.sex))}</span>
        <span class="chip">生年月日 <b>${esc(c.birthDate)}</b></span>
        <span class="chip">記録 <b>${ms.length}</b> 件</span>
        <button class="btn btn--ghost btn--sm" id="btnEditCow" style="min-height:32px">個体情報を編集</button>
      </div>`));
    $('#btnEditCow', root).onclick = () => openCattleForm(c.farmId, c);

    // 最新充足率ゲージ
    const gauge = el(`<div id="gaugeMount"></div>`);
    root.appendChild(gauge);
    renderGauge(gauge, c, ms);

    // グラフ
    const chartCard = el(`
      <div class="card chart-card" style="margin-top:12px">
        <div class="chart-tabs">
          <button data-mode="rate" class="${state.chartMode === 'rate' ? 'active' : ''}">胸囲充足率</button>
          <button data-mode="chest" class="${state.chartMode === 'chest' ? 'active' : ''}">胸囲（実測 vs 標準）</button>
        </div>
        <div class="chart-box"><canvas id="chartCanvas"></canvas></div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--ghost btn--sm" id="btnPng">グラフを画像で保存</button>
          <button class="btn btn--ghost btn--sm" id="btnCsvMes">記録をCSVで保存</button>
        </div>
      </div>`);
    root.appendChild(chartCard);
    $$('.chart-tabs button', chartCard).forEach(b => b.onclick = () => {
      state.chartMode = b.dataset.mode;
      $$('.chart-tabs button', chartCard).forEach(x => x.classList.toggle('active', x === b));
      drawChart(c, ms, state.chartMode);
    });
    $('#btnPng', chartCard).onclick = () => exportChartPNG(c);
    $('#btnCsvMes', chartCard).onclick = () => exportMeasurementsCSV(c, ms);

    // 記録テーブル
    root.appendChild(el(`<h2 class="section-title" style="margin-top:20px">測定記録 <span class="count">${ms.length} 件</span></h2>`));
    root.appendChild(renderMeasureTable(c, ms));

    setFab('胸囲を記録', () => openMeasureForm(c));
    // グラフ描画（DOM 反映後）
    requestAnimationFrame(() => drawChart(c, ms, state.chartMode));
  }

  function renderGauge(mount, c, ms) {
    if (!ms.length) {
      mount.innerHTML = `
        <div class="gauge">
          <div class="gauge__head"><span class="gauge__label">最新の胸囲充足率</span></div>
          <div class="empty" style="padding:18px 0 6px">
            <div class="empty__mark">📐</div>
            <p class="muted">まだ記録がありません。<br>右下の「＋ 胸囲を記録」から測定値を入力してください。</p>
          </div>
        </div>`;
      return;
    }
    const last = ms[ms.length - 1];
    const ev = S.evaluate(c, last.date, last.chest);
    const st = rateStatus(ev.rate);
    const pos = ev.rate == null ? 50 : Math.max(0, Math.min(100, (ev.rate - 80) / 40 * 100));
    const valHtml = ev.rate == null
      ? `<div class="gauge__value is-none"><span class="n">標準式なし</span></div>`
      : `<div class="gauge__value"><span class="n">${fmt(ev.rate, 1)}</span><span class="u">%</span></div>`;

    mount.innerHTML = `
      <div class="gauge">
        <div class="gauge__head">
          <span class="gauge__label">最新の胸囲充足率（${esc(last.date)}）</span>
          <span class="gauge__status ${st.cls}">${st.label}</span>
        </div>
        ${valHtml}
        <div class="gauge__track">
          <div class="gauge__mark" style="left:${pos}%"></div>
        </div>
        <div class="gauge__scale"><span>80</span><span>90</span><span>100</span><span>110</span><span>120</span></div>
        <div class="gauge__meta">
          <div class="metric"><span class="metric__k">測定胸囲</span><span class="metric__v">${fmt(last.chest, 1)}<small>cm</small></span></div>
          <div class="metric"><span class="metric__k">日齢標準胸囲</span><span class="metric__v">${ev.standard == null ? '—' : fmt(ev.standard, 1)}<small>cm</small></span></div>
          <div class="metric"><span class="metric__k">日齢</span><span class="metric__v">${ev.days}<small>日</small></span></div>
        </div>
        ${ev.beyondVertex ? `<div class="warn-note">日齢 ${ev.days} は近似式の有効範囲（育成期）を超えています。標準値は参考程度にご覧ください。</div>` : ''}
      </div>`;
  }

  function renderMeasureTable(c, ms) {
    if (!ms.length) {
      return el(`<div class="empty card card--pad"><p class="muted">記録はまだありません。</p></div>`);
    }
    const box = el(`<div class="table-scroll"></div>`);
    const table = el(`
      <table class="data">
        <thead><tr>
          <th>日付</th><th>日齢</th><th>実測(cm)</th><th>標準(cm)</th><th>充足率</th><th></th>
        </tr></thead>
        <tbody></tbody>
      </table>`);
    const tb = $('tbody', table);
    // 新しい順に表示
    ms.slice().reverse().forEach(m => {
      const ev = S.evaluate(c, m.date, m.chest);
      const st = rateStatus(ev.rate);
      const rateTxt = ev.rate == null ? '—' : fmt(ev.rate, 1) + '%';
      const tr = el(`
        <tr>
          <td>${esc(m.date)}</td>
          <td><span class="num">${ev.days}</span></td>
          <td><span class="num">${fmt(m.chest, 1)}</span></td>
          <td><span class="num">${ev.standard == null ? '—' : fmt(ev.standard, 1)}</span></td>
          <td><span class="rate-pill ${st.pill}">${rateTxt}</span></td>
          <td><button class="del-x" title="削除">✕</button></td>
        </tr>`);
      $('.del-x', tr).onclick = () => {
        if (confirm(`${m.date} の記録（${fmt(m.chest, 1)}cm）を削除しますか？`)) {
          DB.deleteMeasurement(m.id);
          toast('記録を削除しました');
          renderCattle();
        }
      };
      tb.appendChild(tr);
    });
    box.appendChild(table);
    return box;
  }

  /* ============ グラフ ============ */
  // 100%基準線を描く簡易プラグイン
  const refLinePlugin = {
    id: 'refLine',
    afterDatasetsDraw(ch, args, opts) {
      if (!opts || opts.value == null) return;
      const y = ch.scales.y.getPixelForValue(opts.value);
      const { left, right } = ch.chartArea;
      const cx = ch.ctx;
      cx.save();
      cx.strokeStyle = opts.color || '#17211c';
      cx.lineWidth = 1.5;
      cx.setLineDash([6, 5]);
      cx.beginPath(); cx.moveTo(left, y); cx.lineTo(right, y); cx.stroke();
      cx.setLineDash([]);
      cx.fillStyle = opts.color || '#17211c';
      cx.font = "600 11px 'Hiragino Kaku Gothic ProN', sans-serif";
      cx.textAlign = 'right';
      cx.fillText(opts.label || '', right - 4, y - 5);
      cx.restore();
    }
  };
  // PNG書き出し用に背景を白で塗るプラグイン
  const whiteBg = {
    id: 'whiteBg',
    beforeDraw(ch) {
      const cx = ch.ctx;
      cx.save(); cx.globalCompositeOperation = 'destination-over';
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, ch.width, ch.height);
      cx.restore();
    }
  };

  function drawChart(c, ms, mode) {
    const cv = $('#chartCanvas');
    if (!cv) return;
    if (chart) { chart.destroy(); chart = null; }

    const pts = ms.map(m => {
      const ev = S.evaluate(c, m.date, m.chest);
      return { days: ev.days, chest: m.chest, std: ev.standard, rate: ev.rate, date: m.date };
    }).filter(p => p.days != null).sort((a, b) => a.days - b.days);

    const maxDays = Math.max(120, ...pts.map(p => p.days)) + 20;

    const brand = {
      pasture: '#2e6e4e', steel: '#3e6f86', hay: '#b9822a', ink: '#17211c', line: '#e2e4dd', muted: '#5c635b',
    };
    const fontFamily = "'Hiragino Kaku Gothic ProN','Yu Gothic',system-ui,sans-serif";
    Chart.defaults.font.family = fontFamily;
    Chart.defaults.color = brand.muted;

    let cfg;
    if (mode === 'rate') {
      const data = pts.filter(p => p.rate != null).map(p => ({ x: p.days, y: p.rate, date: p.date, chest: p.chest, std: p.std }));
      cfg = {
        type: 'line',
        data: {
          datasets: [{
            label: '胸囲充足率(%)',
            data,
            parsing: false,
            borderColor: brand.pasture,
            backgroundColor: brand.pasture,
            pointBackgroundColor: brand.pasture,
            pointRadius: 5, pointHoverRadius: 7,
            borderWidth: 2.5, tension: .25,
          }]
        },
        options: baseOptions('日齢（日）', '胸囲充足率（%）', maxDays, {
          refLine: { value: 100, label: '標準 100%', color: brand.ink },
          ySuggested: rateRange(data),
          tooltip: (ctx) => {
            const d = ctx.raw;
            return [`${d.date}（日齢 ${d.x}）`, `充足率 ${fmt(d.y, 1)}%`, `実測 ${fmt(d.chest, 1)}cm / 標準 ${fmt(d.std, 1)}cm`];
          }
        })
      };
    } else {
      const curve = S.standardCurve(c.breed, c.sex, maxDays, Math.max(5, Math.round(maxDays / 60)));
      const measured = pts.map(p => ({ x: p.days, y: p.chest, date: p.date, std: p.std, rate: p.rate }));
      const datasets = [];
      if (curve.length) {
        datasets.push({
          label: '日齢標準胸囲', data: curve, parsing: false,
          borderColor: brand.steel, backgroundColor: brand.steel,
          borderDash: [6, 5], pointRadius: 0, borderWidth: 2, tension: .3, order: 2,
        });
      }
      datasets.push({
        label: '実測胸囲', data: measured, parsing: false,
        borderColor: brand.pasture, backgroundColor: brand.pasture,
        pointBackgroundColor: brand.pasture, pointRadius: 5, pointHoverRadius: 7,
        borderWidth: 2.5, tension: .25, order: 1,
      });
      cfg = {
        type: 'line',
        data: { datasets },
        options: baseOptions('日齢（日）', '胸囲（cm）', maxDays, {
          legend: true,
          tooltip: (ctx) => {
            const d = ctx.raw;
            if (ctx.dataset.label === '実測胸囲') {
              return [`${d.date}（日齢 ${d.x}）`, `実測 ${fmt(d.y, 1)}cm`,
                d.rate != null ? `充足率 ${fmt(d.rate, 1)}%` : '標準式なし'];
            }
            return `標準 ${fmt(d.y, 1)}cm（日齢 ${d.x}）`;
          }
        })
      };
    }
    chart = new Chart(cv.getContext('2d'), cfg);
  }

  function rateRange(data) {
    if (!data.length) return { min: 80, max: 120 };
    const ys = data.map(d => d.y);
    let min = Math.min(90, ...ys) - 4;
    let max = Math.max(110, ...ys) + 4;
    return { min: Math.floor(min / 5) * 5, max: Math.ceil(max / 5) * 5 };
  }

  function baseOptions(xTitle, yTitle, maxDays, extra) {
    extra = extra || {};
    const o = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: !!extra.legend, labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
        tooltip: {
          backgroundColor: '#17211c', padding: 10, cornerRadius: 8,
          titleFont: { weight: '700' },
          callbacks: extra.tooltip ? { label: extra.tooltip, title: () => '' } : {},
        },
        refLine: extra.refLine || { value: null },
      },
      scales: {
        x: {
          type: 'linear', min: 0, max: maxDays,
          title: { display: true, text: xTitle, color: '#5c635b', font: { size: 11 } },
          grid: { color: '#eef0ea' },
          ticks: { stepSize: niceStep(maxDays) },
        },
        y: {
          title: { display: true, text: yTitle, color: '#5c635b', font: { size: 11 } },
          grid: { color: '#eef0ea' },
        },
      },
    };
    if (extra.ySuggested) { o.scales.y.min = extra.ySuggested.min; o.scales.y.max = extra.ySuggested.max; }
    return o;
  }
  function niceStep(maxDays) {
    if (maxDays <= 200) return 30;
    if (maxDays <= 400) return 60;
    return 90;
  }

  /* ============ 画像書き出し ============ */
  function exportChartPNG(c) {
    if (!chart) { toast('グラフがありません'); return; }
    const src = chart.canvas;
    const pad = 24, headH = 78, footH = 30;
    const scale = 2; // 高解像度
    const w = src.width, h = src.height;
    const out = document.createElement('canvas');
    out.width = (w + pad * 2);
    out.height = (h + pad * 2 + headH + footH);
    const cx = out.getContext('2d');
    cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, out.width, out.height);

    // ヘッダ
    cx.fillStyle = '#17211c';
    cx.font = "700 26px 'Hiragino Kaku Gothic ProN', sans-serif";
    cx.textAlign = 'left';
    cx.fillText(cattleTitle(c), pad, pad + 26);
    cx.fillStyle = '#5c635b';
    cx.font = "400 16px 'Hiragino Kaku Gothic ProN', sans-serif";
    const modeLabel = state.chartMode === 'rate' ? '胸囲充足率' : '胸囲（実測 vs 標準）';
    cx.fillText(`${S.breedLabel(c.breed)}・${S.sexLabel(c.sex)}　生年月日 ${c.birthDate}　／　${modeLabel}`, pad, pad + 52);

    // グラフ本体
    cx.drawImage(src, pad, pad + headH);

    // フッタ
    cx.fillStyle = '#8a8f86';
    cx.font = "400 12px 'Hiragino Kaku Gothic ProN', sans-serif";
    cx.fillText(`胸囲充足率レコーダー　${todayStr()} 出力　指標: 胸囲充足率＝測定胸囲÷日齢標準胸囲（NOSAIかごしま 叶有斗 先生）`, pad, out.height - 12);

    out.toBlob((blob) => {
      const name = `充足率_${(c.tag || c.name || 'cow')}_${state.chartMode}_${todayStr()}.png`;
      download(name, blob);
      toast('画像を保存しました');
    }, 'image/png');
  }

  /* ============ CSV 入出力 ============ */
  function exportMeasurementsCSV(c, ms) {
    if (!ms.length) { toast('記録がありません'); return; }
    const rows = [['個体識別番号', '名号', '品種', '性別', '生年月日', '測定日', '日齢', '測定胸囲(cm)', '日齢標準胸囲(cm)', '胸囲充足率(%)', 'メモ']];
    ms.forEach(m => {
      const ev = S.evaluate(c, m.date, m.chest);
      rows.push([
        c.tag, c.name, S.breedLabel(c.breed), S.sexLabel(c.sex), c.birthDate,
        m.date, ev.days, m.chest,
        ev.standard == null ? '' : ev.standard.toFixed(1),
        ev.rate == null ? '' : ev.rate.toFixed(1),
        m.memo || '',
      ]);
    });
    download(`記録_${(c.tag || c.name || 'cow')}_${todayStr()}.csv`, DB.toCSV(rows), 'text/csv');
    toast('CSVを保存しました');
  }

  function exportCattleCSV(f) {
    const cattle = DB.listCattle(f.id);
    if (!cattle.length) { toast('登録された牛がいません'); return; }
    const rows = [['個体識別番号', '名号', '品種', '性別', '生年月日']];
    cattle.forEach(c => rows.push([c.tag, c.name, S.breedLabel(c.breed), S.sexLabel(c.sex), c.birthDate]));
    download(`名簿_${f.name}_${todayStr()}.csv`, DB.toCSV(rows), 'text/csv');
    toast('名簿を書き出しました');
  }

  function downloadTemplate() {
    const rows = [
      ['個体識別番号', '名号', '品種', '性別', '生年月日'],
      ['1234567890', 'あかべこ', '黒毛和種', '雌', '2024-05-01'],
      ['1234567891', '', '黒毛和種', '去勢', '2024/06/15'],
      ['9876543210', 'モモ', 'ホルスタイン種', '雌', '2024-04-20'],
    ];
    download('牛個体_登録テンプレート.csv', DB.toCSV(rows), 'text/csv');
    toast('テンプレートを保存しました');
  }

  function importCattleFlow(farmId) {
    const input = $('#fileInput');
    input.value = '';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = DB.importCattleCSV(farmId, String(reader.result));
        showImportResult(res);
        renderFarm();
      };
      reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  function showImportResult(res) {
    const body = el(`<div class="import-summary"></div>`);
    body.appendChild(el(`<p class="ok">${res.added} 頭を登録しました。</p>`));
    if (res.errors.length) {
      body.appendChild(el(`<p class="muted">取り込めなかった行：</p>`));
      const ul = el(`<ul></ul>`);
      res.errors.slice(0, 30).forEach(e => ul.appendChild(el(`<li>${e.line ? esc(e.line) + '行目: ' : ''}${esc(e.reason)}</li>`)));
      if (res.errors.length > 30) ul.appendChild(el(`<li>ほか ${res.errors.length - 30} 件</li>`));
      body.appendChild(ul);
    }
    const btn = el(`<button class="btn btn--primary btn--block" style="margin-top:16px">閉じる</button>`);
    btn.onclick = closeModal;
    body.appendChild(btn);
    openModal('CSV取り込み結果', body);
  }

  /* ============ フォーム（モーダル） ============ */
  function openFarmForm(farm) {
    const editing = !!farm;
    const body = el(`
      <div>
        <div class="field">
          <label for="fName">農場名</label>
          <input id="fName" class="input" type="text" placeholder="例）〇〇牧場" value="${editing ? esc(farm.name) : ''}">
        </div>
        <div class="field">
          <label for="fNote">メモ（任意）</label>
          <input id="fNote" class="input" type="text" placeholder="地区・担当など" value="${editing ? esc(farm.note) : ''}">
        </div>
        <button class="btn btn--primary btn--block" id="fSave">${editing ? '保存する' : '農場を追加'}</button>
        ${editing ? `<button class="btn btn--danger btn--block" id="fDel" style="margin-top:10px">この農場を削除</button>` : ''}
      </div>`);
    $('#fSave', body).onclick = () => {
      const name = $('#fName', body).value.trim();
      if (!name) { toast('農場名を入力してください'); return; }
      const note = $('#fNote', body).value.trim();
      if (editing) { DB.updateFarm(farm.id, { name, note }); toast('保存しました'); route(); }
      else { const f = DB.addFarm(name, note); toast('農場を追加しました'); closeModal(); go('#/farm/' + f.id); }
      closeModal();
      if (state.view === 'farms') renderFarms();
      if (state.view === 'farm') updateBar();
    };
    if (editing) $('#fDel', body).onclick = () => {
      if (confirm(`「${farm.name}」を削除します。\n所属する牛と記録もすべて削除されます。よろしいですか？`)) {
        DB.deleteFarm(farm.id); toast('農場を削除しました'); go('#/');
      }
    };
    openModal(editing ? '農場を編集' : '農場を追加', body);
    setTimeout(() => $('#fName', body).focus(), 50);
  }

  function openCattleForm(farmId, cow) {
    const editing = !!cow;
    const b = editing ? cow.breed : 'wagyu';
    const sx = editing ? cow.sex : 'male';
    const body = el(`
      <div>
        <div class="field">
          <label for="cTag">個体識別番号</label>
          <input id="cTag" class="input" type="text" inputmode="numeric" placeholder="例）1234567890" value="${editing ? esc(cow.tag) : ''}">
        </div>
        <div class="field">
          <label for="cName">名号（任意）</label>
          <input id="cName" class="input" type="text" placeholder="例）あかべこ" value="${editing ? esc(cow.name) : ''}">
        </div>
        <div class="field">
          <label>品種</label>
          <div class="seg" id="cBreed">
            <input type="radio" name="breed" id="b1" value="wagyu" ${b === 'wagyu' ? 'checked' : ''}><label for="b1">黒毛和種</label>
            <input type="radio" name="breed" id="b2" value="holstein" ${b === 'holstein' ? 'checked' : ''}><label for="b2">ホルスタイン種</label>
          </div>
        </div>
        <div class="field">
          <label>性別</label>
          <div class="seg" id="cSex">
            <input type="radio" name="sex" id="s1" value="male" ${sx === 'male' ? 'checked' : ''}><label for="s1">雄</label>
            <input type="radio" name="sex" id="s2" value="castrated" ${sx === 'castrated' ? 'checked' : ''}><label for="s2">去勢</label>
            <input type="radio" name="sex" id="s3" value="female" ${sx === 'female' ? 'checked' : ''}><label for="s3">雌</label>
          </div>
          <div class="hint" id="sexHint"></div>
        </div>
        <div class="field">
          <label for="cBirth">生年月日</label>
          <input id="cBirth" class="input" type="date" value="${editing ? esc(cow.birthDate) : ''}" max="${todayStr()}">
        </div>
        <button class="btn btn--primary btn--block" id="cSave">${editing ? '保存する' : '牛を追加'}</button>
        ${editing ? `<button class="btn btn--danger btn--block" id="cDel" style="margin-top:10px">この牛を削除</button>` : ''}
      </div>`);

    const hint = $('#sexHint', body);
    function updateHint() {
      const breed = $('input[name=breed]:checked', body).value;
      const sex = $('input[name=sex]:checked', body).value;
      hint.textContent = S.hasFormula(breed, sex) ? '' : 'この品種・性別の日齢標準式は未定義です（実測は記録できますが充足率は計算されません）。';
    }
    $$('input[name=breed],input[name=sex]', body).forEach(r => r.onchange = updateHint);
    updateHint();

    $('#cSave', body).onclick = () => {
      const tag = $('#cTag', body).value.trim();
      const name = $('#cName', body).value.trim();
      const breed = $('input[name=breed]:checked', body).value;
      const sex = $('input[name=sex]:checked', body).value;
      const birthDate = $('#cBirth', body).value;
      if (!tag && !name) { toast('個体識別番号か名号を入力してください'); return; }
      if (!birthDate) { toast('生年月日を入力してください'); return; }
      if (editing) { DB.updateCattle(cow.id, { tag, name, breed, sex, birthDate }); toast('保存しました'); closeModal(); renderCattle(); updateBar(); }
      else { DB.addCattle(farmId, { tag, name, breed, sex, birthDate }); toast('牛を追加しました'); closeModal(); renderFarm(); }
    };
    if (editing) $('#cDel', body).onclick = () => {
      if (confirm(`「${cattleTitle(cow)}」を削除します。\nこの牛の記録もすべて削除されます。よろしいですか？`)) {
        DB.deleteCattle(cow.id); toast('牛を削除しました'); go('#/farm/' + cow.farmId);
      }
    };
    openModal(editing ? '個体情報を編集' : '牛を追加', body);
  }

  function openMeasureForm(c) {
    const body = el(`
      <div>
        <div class="field">
          <label for="mDate">測定日</label>
          <input id="mDate" class="input" type="date" value="${todayStr()}" max="${todayStr()}">
        </div>
        <div class="field">
          <label for="mChest">測定胸囲（cm）</label>
          <input id="mChest" class="input num-input" type="number" inputmode="decimal" step="0.1" min="0" placeholder="0.0">
        </div>
        <div id="preview"></div>
        <div class="field" style="margin-top:14px">
          <label for="mMemo">メモ（任意）</label>
          <input id="mMemo" class="input" type="text" placeholder="体況・治療など">
        </div>
        <button class="btn btn--primary btn--block" id="mSave">記録する</button>
      </div>`);

    const dateEl = $('#mDate', body), chestEl = $('#mChest', body), pv = $('#preview', body);
    function preview() {
      const chest = parseFloat(chestEl.value);
      const date = dateEl.value;
      if (!date || isNaN(chest) || chest <= 0) { pv.innerHTML = ''; return; }
      const ev = S.evaluate(c, date, chest);
      const st = rateStatus(ev.rate);
      const rateHtml = ev.rate == null
        ? `<span class="gauge__value is-none" style="display:block"><span class="n" style="font-size:1.6rem">標準式なし</span></span>`
        : `<div class="gauge__value"><span class="n" style="font-size:3.2rem">${fmt(ev.rate, 1)}</span><span class="u">%</span></div>`;
      pv.innerHTML = `
        <div class="gauge" style="margin-top:4px">
          <div class="gauge__head">
            <span class="gauge__label">この記録の充足率（日齢 ${ev.days}）</span>
            <span class="gauge__status ${st.cls}">${st.label}</span>
          </div>
          ${rateHtml}
          <div class="gauge__meta">
            <div class="metric"><span class="metric__k">日齢標準胸囲</span><span class="metric__v">${ev.standard == null ? '—' : fmt(ev.standard, 1)}<small>cm</small></span></div>
          </div>
          ${ev.beyondVertex ? `<div class="warn-note">日齢が近似式の有効範囲を超えています。参考値としてご覧ください。</div>` : ''}
        </div>`;
    }
    chestEl.addEventListener('input', preview);
    dateEl.addEventListener('change', preview);

    $('#mSave', body).onclick = () => {
      const date = dateEl.value;
      const chest = parseFloat(chestEl.value);
      if (!date) { toast('測定日を入力してください'); return; }
      if (isNaN(chest) || chest <= 0) { toast('胸囲（cm）を入力してください'); return; }
      DB.addMeasurement(c.id, date, chest, $('#mMemo', body).value.trim());
      toast('記録しました');
      closeModal();
      renderCattle();
    };
    openModal('胸囲を記録', body);
    setTimeout(() => chestEl.focus(), 60);
  }

  /* ============ 画面: データ管理 ============ */
  function renderData() {
    const root = $('#view-data');
    const db = DB._raw();
    root.innerHTML = '';
    root.appendChild(el(`
      <div class="card card--pad">
        <p class="eyebrow">保存について</p>
        <p class="muted" style="margin:0 0 4px">データはこの端末（ブラウザ）の中だけに保存されます。別の端末に移すときや万一に備えて、下のバックアップを保存してください。</p>
        <div class="chips" style="margin-top:12px">
          <span class="chip">農場 <b>${db.farms.length}</b></span>
          <span class="chip">牛 <b>${db.cattle.length}</b></span>
          <span class="chip">記録 <b>${db.measurements.length}</b></span>
        </div>
      </div>`));

    const backup = el(`
      <div class="card card--pad stack" style="margin-top:12px">
        <p class="eyebrow" style="margin:0">バックアップ</p>
        <button class="btn btn--primary btn--block" id="expJson">全データを保存（JSON）</button>
        <button class="btn btn--ghost btn--block" id="impMerge">バックアップを読み込む（追加）</button>
        <button class="btn btn--ghost btn--block" id="impReplace">バックアップで置き換える</button>
      </div>`);
    root.appendChild(backup);
    $('#expJson', backup).onclick = () => {
      download(`胸囲充足率_バックアップ_${todayStr()}.json`, DB.exportJSON(), 'application/json');
      toast('バックアップを保存しました');
    };
    $('#impMerge', backup).onclick = () => importJsonFlow('merge');
    $('#impReplace', backup).onclick = () => importJsonFlow('replace');

    const tpl = el(`
      <div class="card card--pad stack" style="margin-top:12px">
        <p class="eyebrow" style="margin:0">CSVテンプレート</p>
        <p class="muted" style="margin:0">牛の一括登録に使うCSVの雛形です。列は「個体識別番号／名号／品種／性別／生年月日」。</p>
        <button class="btn btn--ghost btn--block" id="tpl2">テンプレートを保存</button>
      </div>`);
    root.appendChild(tpl);
    $('#tpl2', tpl).onclick = downloadTemplate;

    const danger = el(`
      <div class="card card--pad" style="margin-top:12px">
        <p class="eyebrow" style="margin:0 0 8px">全消去</p>
        <button class="btn btn--danger btn--block" id="clr">すべてのデータを削除</button>
      </div>`);
    root.appendChild(danger);
    $('#clr', danger).onclick = () => {
      if (confirm('すべての農場・牛・記録を削除します。元に戻せません。よろしいですか？')) {
        DB.clearAll(); toast('削除しました'); go('#/');
      }
    };
    setFab(null);
  }

  function importJsonFlow(mode) {
    const input = $('#jsonInput');
    input.value = '';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (mode === 'replace' && !confirm('現在のデータを、読み込むバックアップで置き換えます。よろしいですか？')) return;
          DB.importJSON(String(reader.result), mode);
          toast('読み込みました');
          renderData();
        } catch (e) {
          alert('読み込みに失敗しました。正しいバックアップファイル（JSON）か確認してください。');
        }
      };
      reader.readAsText(file, 'UTF-8');
    };
    input.click();
  }

  /* ============ モーダル / FAB ============ */
  function openModal(title, contentNode) {
    closeModal();
    const back = el(`
      <div class="modal-back">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="modal__grip"></div>
          <h2>${esc(title)}</h2>
        </div>
      </div>`);
    $('.modal', back).appendChild(contentNode);
    back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    $('#modalRoot').appendChild(back);
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('#modalRoot').innerHTML = '';
    document.body.style.overflow = '';
  }

  function setFab(label, handler) {
    const fab = $('#fab');
    if (!label) { fab.style.display = 'none'; fab.onclick = null; return; }
    $('#fabLabel').textContent = label;
    fab.style.display = 'inline-flex';
    fab.onclick = handler;
  }

  /* ============ 起動 ============ */
  $('#dataBtn').onclick = () => go('#/data');
  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  route();
})();

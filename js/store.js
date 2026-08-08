/*
 * store.js
 * 端末内（localStorage）にデータを保存するデータ層。
 * データは利用中の端末・ブラウザにのみ保存されます。
 * 端末間の移動やバックアップには CSV / JSON の書き出しを使ってください。
 *
 * データ構造:
 *   farms:        [{ id, name, note }]
 *   cattle:       [{ id, farmId, tag, name, breed, sex, birthDate }]
 *   measurements: [{ id, cattleId, date, chest, memo }]
 */
(function (global) {
  'use strict';

  const KEY = 'chestApp.v1';

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn('データの読み込みに失敗しました:', e);
    }
    return { farms: [], cattle: [], measurements: [] };
  }

  function normalize(obj) {
    return {
      farms: Array.isArray(obj.farms) ? obj.farms : [],
      cattle: Array.isArray(obj.cattle) ? obj.cattle : [],
      measurements: Array.isArray(obj.measurements) ? obj.measurements : [],
    };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      alert('保存に失敗しました。ブラウザの空き容量やプライベートモードをご確認ください。');
      console.error(e);
      return false;
    }
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  /* ---------- 農場 ---------- */
  function listFarms() {
    return db.farms.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }
  function getFarm(id) { return db.farms.find(f => f.id === id) || null; }
  function addFarm(name, note) {
    const f = { id: uid('farm'), name: String(name || '').trim(), note: String(note || '').trim() };
    db.farms.push(f); save(); return f;
  }
  function updateFarm(id, patch) {
    const f = getFarm(id); if (!f) return null;
    Object.assign(f, patch); save(); return f;
  }
  function deleteFarm(id) {
    const cattleIds = db.cattle.filter(c => c.farmId === id).map(c => c.id);
    db.measurements = db.measurements.filter(m => !cattleIds.includes(m.cattleId));
    db.cattle = db.cattle.filter(c => c.farmId !== id);
    db.farms = db.farms.filter(f => f.id !== id);
    save();
  }

  /* ---------- 牛個体 ---------- */
  function listCattle(farmId) {
    return db.cattle
      .filter(c => c.farmId === farmId)
      .sort((a, b) => (a.tag || a.name || '').localeCompare(b.tag || b.name || '', 'ja'));
  }
  function getCattle(id) { return db.cattle.find(c => c.id === id) || null; }
  function addCattle(farmId, data) {
    const c = {
      id: uid('cow'),
      farmId,
      tag: String(data.tag || '').trim(),
      name: String(data.name || '').trim(),
      breed: data.breed,
      sex: data.sex,
      birthDate: data.birthDate,
    };
    db.cattle.push(c); save(); return c;
  }
  function updateCattle(id, patch) {
    const c = getCattle(id); if (!c) return null;
    Object.assign(c, patch); save(); return c;
  }
  function deleteCattle(id) {
    db.measurements = db.measurements.filter(m => m.cattleId !== id);
    db.cattle = db.cattle.filter(c => c.id !== id);
    save();
  }

  /* ---------- 測定記録 ---------- */
  function listMeasurements(cattleId) {
    return db.measurements
      .filter(m => m.cattleId === cattleId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  function addMeasurement(cattleId, date, chest, memo) {
    const m = {
      id: uid('mes'),
      cattleId,
      date,
      chest: Number(chest),
      memo: String(memo || '').trim(),
    };
    db.measurements.push(m); save(); return m;
  }
  function updateMeasurement(id, patch) {
    const m = db.measurements.find(x => x.id === id); if (!m) return null;
    Object.assign(m, patch); save(); return m;
  }
  function deleteMeasurement(id) {
    db.measurements = db.measurements.filter(m => m.id !== id);
    save();
  }

  /* ---------- CSV ユーティリティ ---------- */
  // RFC4180 準拠の簡易パーサ（ダブルクオート・改行埋め込み対応）
  function parseCSV(text) {
    // BOM 除去
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    // 空行を除去
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  function toCSV(rows) {
    return rows.map(r => r.map(cell => {
      const s = (cell == null) ? '' : String(cell);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
  }

  // 品種・性別の日本語 → キー変換（CSV 取り込み用）
  const BREED_ALIAS = {
    '黒毛和種': 'wagyu', '黒毛和牛': 'wagyu', '和牛': 'wagyu', 'wagyu': 'wagyu',
    'ホルスタイン種': 'holstein', 'ホルスタイン': 'holstein', 'ホル': 'holstein', 'holstein': 'holstein',
  };
  const SEX_ALIAS = {
    '雄': 'male', 'オス': 'male', 'おす': 'male', 'male': 'male', 'M': 'male',
    '去勢': 'castrated', 'castrated': 'castrated', 'steer': 'castrated',
    '雌': 'female', 'メス': 'female', 'めす': 'female', 'female': 'female', 'F': 'female',
  };

  // 牛個体 CSV の取り込み。ヘッダ:
  //   個体識別番号, 名号, 品種, 性別, 生年月日
  // 返り値: { added, errors:[{line, reason}] }
  function importCattleCSV(farmId, text) {
    const rows = parseCSV(text);
    const result = { added: 0, errors: [] };
    if (!rows.length) { result.errors.push({ line: 0, reason: 'データがありません' }); return result; }

    // ヘッダ行を検出（1行目にキーワードが含まれればヘッダとして扱う）
    let start = 0;
    const header = rows[0].map(s => s.trim());
    const looksHeader = header.some(h => /個体|識別|品種|性別|生年|名号|tag|breed|sex|birth/i.test(h));
    let idx = { tag: 0, name: 1, breed: 2, sex: 3, birth: 4 };
    if (looksHeader) {
      start = 1;
      idx = mapHeader(header);
    }

    for (let r = start; r < rows.length; r++) {
      const cells = rows[r];
      const line = r + 1;
      const rawTag = get(cells, idx.tag);
      const rawName = get(cells, idx.name);
      const rawBreed = get(cells, idx.breed);
      const rawSex = get(cells, idx.sex);
      const rawBirth = get(cells, idx.birth);

      const breed = BREED_ALIAS[rawBreed];
      const sex = SEX_ALIAS[rawSex];
      const birth = normalizeDate(rawBirth);

      if (!rawTag && !rawName) { result.errors.push({ line, reason: '個体識別番号・名号がどちらも空です' }); continue; }
      if (!breed) { result.errors.push({ line, reason: `品種が不正です: "${rawBreed}"（黒毛和種 / ホルスタイン種）` }); continue; }
      if (!sex) { result.errors.push({ line, reason: `性別が不正です: "${rawSex}"（雄 / 去勢 / 雌）` }); continue; }
      if (!birth) { result.errors.push({ line, reason: `生年月日が不正です: "${rawBirth}"（例 2024-05-01）` }); continue; }

      addCattle(farmId, { tag: rawTag, name: rawName, breed, sex, birthDate: birth });
      result.added++;
    }
    return result;
  }

  function mapHeader(header) {
    const find = (re, def) => {
      const i = header.findIndex(h => re.test(h));
      return i >= 0 ? i : def;
    };
    return {
      tag: find(/個体|識別|tag|number/i, 0),
      name: find(/名号|名前|name/i, 1),
      breed: find(/品種|breed/i, 2),
      sex: find(/性別|sex/i, 3),
      birth: find(/生年|誕生|birth/i, 4),
    };
  }

  function get(arr, i) { return (i != null && arr[i] != null) ? String(arr[i]).trim() : ''; }

  function normalizeDate(s) {
    if (!s) return null;
    const m = s.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (!m) return null;
    const y = m[1], mo = String(+m[2]).padStart(2, '0'), d = String(+m[3]).padStart(2, '0');
    const dt = new Date(+y, +mo - 1, +d);
    if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
    return `${y}-${mo}-${d}`;
  }

  /* ---------- バックアップ（全データ JSON） ---------- */
  function exportJSON() { return JSON.stringify(db, null, 2); }
  function importJSON(text, mode) {
    // mode: 'replace' | 'merge'
    const incoming = normalize(JSON.parse(text));
    if (mode === 'merge') {
      const seen = new Set(db.farms.map(f => f.id));
      incoming.farms.forEach(f => { if (!seen.has(f.id)) db.farms.push(f); });
      const cSeen = new Set(db.cattle.map(c => c.id));
      incoming.cattle.forEach(c => { if (!cSeen.has(c.id)) db.cattle.push(c); });
      const mSeen = new Set(db.measurements.map(m => m.id));
      incoming.measurements.forEach(m => { if (!mSeen.has(m.id)) db.measurements.push(m); });
    } else {
      db = incoming;
    }
    save();
  }

  function clearAll() {
    db = { farms: [], cattle: [], measurements: [] };
    save();
  }

  global.Store = {
    listFarms, getFarm, addFarm, updateFarm, deleteFarm,
    listCattle, getCattle, addCattle, updateCattle, deleteCattle,
    listMeasurements, addMeasurement, updateMeasurement, deleteMeasurement,
    parseCSV, toCSV, importCattleCSV,
    exportJSON, importJSON, clearAll,
    _raw: () => db,
  };
})(window);

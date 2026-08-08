/*
 * standards.js
 * 日齢標準胸囲の計算と胸囲充足率の算出。
 *
 * 指標「胸囲充足率」＝ 測定胸囲 ÷ 日齢標準胸囲 × 100（％）
 * 考案：NOSAIかごしま 叶 有斗 先生
 *
 * 日齢標準胸囲の近似式（日齢を x とする、単位: cm）
 *   黒毛和種・雄   ： -0.0004*x^2 + 0.4221*x + 77.555
 *   黒毛和種・去勢 ： -0.0004*x^2 + 0.4221*x + 77.555
 *   黒毛和種・雌   ： -0.0005*x^2 + 0.4101*x + 78.115
 *   ホルスタイン種・雌 ： -0.0003*x^2 + 0.3441*x + 81.301
 *
 * これらは二次近似式であり、頂点（vertex）を過ぎると値が減少に転じます。
 * 育成期の近似として使う想定のため、頂点日齢を超える領域では注意フラグを立てます。
 */
(function (global) {
  'use strict';

  // 品種・性別の表示名（UI とデータの対応）
  const BREEDS = {
    wagyu:    '黒毛和種',
    holstein: 'ホルスタイン種',
  };
  const SEXES = {
    male:      '雄',
    castrated: '去勢',
    female:    '雌',
  };

  // 係数テーブル: a*x^2 + b*x + c
  // キーは `${breed}_${sex}`
  const COEFFS = {
    wagyu_male:      { a: -0.0004, b: 0.4221, c: 77.555 },
    wagyu_castrated: { a: -0.0004, b: 0.4221, c: 77.555 },
    wagyu_female:    { a: -0.0005, b: 0.4101, c: 78.115 },
    holstein_female: { a: -0.0003, b: 0.3441, c: 81.301 },
    // ホルスタイン種の雄・去勢は式が提供されていないため未定義（実測のみ記録可）
  };

  function key(breed, sex) {
    return `${breed}_${sex}`;
  }

  function hasFormula(breed, sex) {
    return Object.prototype.hasOwnProperty.call(COEFFS, key(breed, sex));
  }

  // 日齢（生年月日からの経過日数、当日=0）
  // dates は 'YYYY-MM-DD' 文字列 or Date
  function ageInDays(birth, measure) {
    const b = toDateOnly(birth);
    const m = toDateOnly(measure);
    if (!b || !m) return null;
    const ms = m.getTime() - b.getTime();
    return Math.round(ms / 86400000);
  }

  function toDateOnly(v) {
    if (v instanceof Date) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }
    if (typeof v === 'string') {
      // YYYY-MM-DD / YYYY/MM/DD の両方を許容
      const m = v.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (!m) return null;
      const y = +m[1], mo = +m[2] - 1, d = +m[3];
      const dt = new Date(y, mo, d);
      // 妥当性チェック（例: 2月30日を弾く）
      if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
      return dt;
    }
    return null;
  }

  // 日齢標準胸囲（cm）。式が無い組合せは null。
  function standardChest(breed, sex, days) {
    const c = COEFFS[key(breed, sex)];
    if (!c || days == null || days < 0) return null;
    return c.a * days * days + c.b * days + c.c;
  }

  // 二次式の頂点日齢（この日齢を超えると近似が減少に転じる）
  function vertexDay(breed, sex) {
    const c = COEFFS[key(breed, sex)];
    if (!c) return null;
    return -c.b / (2 * c.a);
  }

  // 胸囲充足率（％）。標準式が無い場合は null。
  function sufficiencyRate(breed, sex, days, measuredChest) {
    const std = standardChest(breed, sex, days);
    if (std == null || !std || measuredChest == null) return null;
    return (measuredChest / std) * 100;
  }

  // 1件の測定に対する評価結果をまとめて返す
  function evaluate(cattle, measureDate, measuredChest) {
    const days = ageInDays(cattle.birthDate, measureDate);
    const std = standardChest(cattle.breed, cattle.sex, days);
    const rate = (std && measuredChest != null) ? (measuredChest / std) * 100 : null;
    const vtx = vertexDay(cattle.breed, cattle.sex);
    return {
      days,
      standard: std,           // 日齢標準胸囲（cm） or null
      rate,                    // 充足率（％） or null
      beyondVertex: (vtx != null && days != null && days > vtx), // 近似の有効範囲を超過
      hasFormula: hasFormula(cattle.breed, cattle.sex),
    };
  }

  // 標準曲線用のサンプル点（グラフの基準線描画に使用）
  // 返り値: [{x: 日齢, y: 標準胸囲}]
  function standardCurve(breed, sex, maxDays, step) {
    if (!hasFormula(breed, sex)) return [];
    step = step || 10;
    const pts = [];
    for (let x = 0; x <= maxDays; x += step) {
      pts.push({ x, y: standardChest(breed, sex, x) });
    }
    if (pts.length && pts[pts.length - 1].x !== maxDays) {
      pts.push({ x: maxDays, y: standardChest(breed, sex, maxDays) });
    }
    return pts;
  }

  global.Standards = {
    BREEDS, SEXES, COEFFS,
    hasFormula, ageInDays, standardChest, vertexDay,
    sufficiencyRate, evaluate, standardCurve,
    breedLabel: (b) => BREEDS[b] || b,
    sexLabel: (s) => SEXES[s] || s,
  };
})(window);

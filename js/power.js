// 最低樣本數：多元迴歸 F 檢定（固定模型，R² 異於 0），與 G*Power 相同算法：λ = f²·N，df1 = k，df2 = N − k − 1
// 已核對 G*Power 結果，例如 f² = .15、α = .05、檢定力 .80、預測變數 5 個 → 92
function lnGamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
  for (let m = 1; m <= 1000; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; } return h; }
function ibeta(x, a, b) { if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
const fCdf = (f, d1, d2) => ibeta(d1 * f / (d1 * f + d2), d1 / 2, d2 / 2);
function fInv(p, d1, d2) { let lo = 0, hi = 1; while (fCdf(hi, d1, d2) < p) hi *= 2; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; fCdf(m, d1, d2) < p ? lo = m : hi = m; } return (lo + hi) / 2; }
function ncfCdf(f, d1, d2, lam) { const x = d1 * f / (d1 * f + d2), h = lam / 2; let s = 0;
  const jmax = Math.ceil(h + 12 * Math.sqrt(h + 1) + 30);
  for (let j = 0; j <= jmax; j++) s += Math.exp(-h + j * Math.log(h || 1e-300) - lnGamma(j + 1)) * ibeta(x, d1 / 2 + j, d2 / 2);
  return s; }
const GP_MEMO = new Map();
function gpN(f2, alpha, power, k) {
  const key = [f2, alpha, power, k].join("|"); if (GP_MEMO.has(key)) return GP_MEMO.get(key);
  const n = gpN0(f2, alpha, power, k); GP_MEMO.set(key, n); return n;
}
function gpN0(f2, alpha, power, k) {   // 檢定力隨樣本數遞增：先倍增找上界，再二分搜尋最小的 N
  const pw = n => { const d2 = n - k - 1, fc = fInv(1 - alpha, k, d2); return 1 - ncfCdf(fc, k, d2, f2 * n); };
  let lo = k + 2, hi = k + 2; if (pw(lo) >= power) return lo;
  while (pw(hi) < power) { lo = hi; hi *= 2; if (hi > 200000) return null; }
  while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); pw(m) >= power ? hi = m : lo = m; }
  return hi;
}

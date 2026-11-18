// Shared set-up of the numerical experiments: the calibrated columns of final4.js (same soil, kmult, Kmac_A1) and the
// five ways in which the forest column differs from the clear-cut one. Nothing here is fitted again.
const fs = require('fs'), path = require('path'), S = require('../sim/solver.js');
const SIM = p => path.join(__dirname, '..', 'sim', p);
const R2 = JSON.parse(fs.readFileSync(SIM('sim2_results.json')));
const FITS = JSON.parse(fs.readFileSync(SIM('fits_main.json')));
const KMAC_A1 = [null, 1, 3, 10, 30][R2.kmacChosenIndex];
const L = {}; for (const s of ['NV', 'V']) L[s] = { F: JSON.parse(fs.readFileSync(SIM(`forcing_${s}.json`))), M: JSON.parse(fs.readFileSync(SIM(`model_${s}.json`))), fits: FITS[s] };
if (L.NV.M.slope_deg !== L.V.M.slope_deg) throw new Error('different slopes');
// the soil must be identical in the two columns (same zones, curves and conductivities) for the attribution to be about vegetation only
for (const k of ['A1', 'A2']) for (const q of ['theta_r', 'theta_s', 'alpha', 'n']) if (FITS.NV[k][q] !== FITS.V[k][q]) throw new Error('soil curves differ: ' + k + q);
L.NV.M.zones.forEach((z, i) => { const w = L.V.M.zones[i]; for (const q of ['zTop_cm', 'zBot_cm', 'Ks_cm_h', 'Kmac_cm_h', 'hmac_cm', 'ret']) if (z[q] !== w[q]) throw new Error('zones differ: ' + q); });
// factors: key -> [description, what the forest value replaces]
const FACTORS = {
  I: 'intercettazione (pioggia netta al suolo)',
  T: 'quota di traspirazione (LAI 3 contro 1)',
  R: 'profilo delle radici misurato',
  E: 'domanda evaporativa calibrata (fattore di ETP)',
  S: 'stato iniziale misurato',
};
// column with the clear-cut values, the factors in `on` taking the forest value
function column(on, s0NV, s0V, outDepths) {
  const M = JSON.parse(JSON.stringify(L.NV.M)), V = L.V.M;
  M.eFactor = on.includes('E') ? R2.params.V.eFactor : R2.params.NV.eFactor;
  M.zones.forEach(z => { z.Ks_cm_h *= Math.pow(10, R2.params.NV.log10_kmult); if (z.name === 'A1' && KMAC_A1 != null) z.Kmac_cm_h = KMAC_A1; });
  if (on.includes('T')) { M.tFrac = V.tFrac; M.LAI = V.LAI; }
  if (on.includes('R')) M.roots = V.roots;
  M.outDepths_cm = outDepths; M.profileHours = [];
  return S.buildConfig(M, L.NV.fits, on.includes('S') ? s0V : s0NV);
}
const idx = (F, t) => { const t0 = Date.parse(F.t0.replace(' ', 'T') + 'Z'); return Math.round((Date.parse(t.replace(' ', 'T') + 'Z') - t0) / 3.6e6); };
module.exports = { S, L, R2, KMAC_A1, FACTORS, column, idx };

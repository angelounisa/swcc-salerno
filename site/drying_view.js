<script>
(function(){
'use strict';
const S2 = window.SIM2, SW = S2.swcc, KF = S2.kfield, EV = S2.events, TC = S2.thetaCal, BV = S2.baselineVertical, EX = S2.excess;
const BETA = S2.sites.NV.model.slope_deg, VF = S2.verify, LAYFIT = S2.sites.NV.fits;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
// model tab: every element id carries the prefix m- (the comparison tab uses the same names); sections removed from this tab resolve to a detached div
const $ = id => document.getElementById('m-'+id) || document.createElement('div');
const PR = (id, ...a) => { const e = document.getElementById('m-'+id); if (e) return Plotly.react(e, ...a); };
const SITES = ['NV','V'], LABEL = {NV:'Senza vegetazione', V:'Vegetata'}, COL = {NV:'--nv', V:'--veg'};
const PAIRS = [['15','15'],['30','35'],['60','60']];
const CMH = 360000, CM_PER_KPA = 10.1972;
const fx = (x,k) => (x==null||!isFinite(x)) ? '–' : Number(x).toFixed(k);
const it = x => Math.round(x).toLocaleString('it-IT');
const pill = s => `<span class="pill" style="color:var(${COL[s]})">${LABEL[s]}</span>`;
const ksTxt = k => `${k<0.1?k.toPrecision(2):fx(k,k<10?2:1)} cm/h (${(k/CMH).toExponential(1)} m/s)`;
const seVG = (s,a,n) => Math.pow(1+Math.pow(a*s,n), -(1-1/n));
const pad = x => String(x).padStart(2,'0');
const t0ms = Date.parse(S2.t0.replace(' ','T')+'Z');
const tstr = i => { const d=new Date(t0ms+i*3.6e6); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`; };
const nH = S2.n_hours, T = Array.from({length:nH},(_,i)=>tstr(i));
const dIt = s => s.slice(0,10).split('-').reverse().join('/');
const CAL = s => S2.sites[s].calib, MB = s => S2.sites[s].massBalance, FT = s => S2.sites[s].forcing.totals;
const GEO = [
  {L:'A1', d:'topsoil biogeochimicamente attivo', thick:'5–30 cm', Gs:2.67, n:0.65, gd:9.30, Ks:1.03e-6, phi:38.5, vg:'θs 0,53 · θr 0,04 · m 0,44 (n 1,79)'},
  {L:'A2', d:'cenere limo-sabbiosa bruna con pomici (79 d.C.)', thick:'65–100 cm', Gs:2.69, n:0.59, gd:10.80, Ks:9.27e-6, phi:38.5, vg:'θs 0,52 · θr 0,15 · m 0,45 (n 1,82)'},
  {L:'C1', d:'cenere limo-sabbiosa giallastra (pre 79 d.C.), discontinua', thick:'15 cm (medio)', Gs:2.74, n:0.64, gd:9.05, Ks:4.82e-6, phi:36.7, vg:'–'}];
const LAYER_OF = k => k==='15' ? 'A1' : 'A2';
const SHADE = {NV_15:'--nv', V_15:'--veg', NV_30:'--nv', NV_60:'--dry', V_35:'--veg', V_60:'--wet'};

function krMualem(s, a, n, hs){ const m=1-1/n, SF=h=>{ const an=Math.pow(a/CM_PER_KPA*h,n); return [Math.pow(1+an,-m), 1-Math.pow(an/(1+an),m)]; };
  const [S_,F]=SF(s*CM_PER_KPA), [Ss,Fs]=SF(-hs); return Math.sqrt(S_/Ss)*Math.pow(F/Fs,2); }

function fill(){
  // --- 1. main drying curves in Se
  let h = '<thead><tr><th>Strato</th><th>Sensore</th><th>θr</th><th>θs</th><th>α [1/kPa] (IC 95%)</th><th>1/α [kPa]</th><th>n (IC 95%)</th><th>RMSE S<sub>e</sub> curva propria</th><th>RMSE S<sub>e</sub> curva comune</th><th>θr · θs con curva comune</th></tr></thead><tbody>';
  for (const lay of ['A1','A2']) { const sh=SW.shared[lay];
    Object.keys(sh.sensors).forEach(key => { const R=SW.sensors[key], p=R.params, ab=new Set(R.params_at_bound), q=sh.sensors[key];
      h += `<tr><td>${lay}</td><td>${pill(R.site)} ${R.depth_cm} cm</td><td class="num${ab.has('theta_r')?' bound':''}">${fx(p.theta_r,3)}${ab.has('theta_r')?' <span class="flag">vincolo</span>':''}</td><td class="num">${fx(p.theta_s,3)}</td><td class="num">${fx(p.alpha,3)} <span class="muted">(${fx(R.ci95.alpha[0],3)}–${fx(R.ci95.alpha[1],3)})</span></td><td class="num">${fx(1/p.alpha,1)}</td><td class="num">${fx(p.n,2)} <span class="muted">(${fx(R.ci95.n[0],2)}–${fx(R.ci95.n[1],2)})</span></td><td class="num">${fx(R.rmse_Se_env,3)}</td><td class="num">${fx(q.rmse_Se_shared,3)}</td><td class="num">${fx(q.theta_r,3)} · ${fx(q.theta_s,3)}</td></tr>`; });
    h += `<tr><td><b>${lay}</b></td><td><b>strato nel modello (entrambe le parcelle)</b></td><td class="num"><b>${fx(LAYFIT[lay].theta_r,3)}</b></td><td class="num"><b>${fx(LAYFIT[lay].theta_s,3)}</b></td><td class="num"><b>${fx(sh.alpha,3)}</b></td><td class="num"><b>${fx(1/sh.alpha,1)}</b></td><td class="num"><b>${fx(sh.n,2)}</b></td><td></td><td></td><td class="muted">media dei sensori</td></tr>`; }
  $('dcTable').innerHTML = h+'</tbody>';
  // --- 2. conductivity
  const zA1=S2.sites.NV.model.zones[0], zA2=S2.sites.NV.model.zones[1], km=Math.pow(10,S2.params.NV.log10_kmult);
  h = '<thead><tr><th>Piano di controllo</th><th>Notti usate</th><th>Campo di suzione [kPa]</th><th>K<sub>s</sub> di matrice (mediana)</th><th>25°–75° percentile [cm/h]</th><th>Pendenza rispetto a Mualem</th></tr></thead><tbody>';
  Object.entries(KF.planes).forEach(([k,p]) => { const s=k.split(' ')[0]; h += `<tr><td>${pill(s)} ${k.slice(s.length+1)}</td><td class="num">${p.n_nights}</td><td class="num">${fx(p.s_range_kPa[0],1)}–${fx(p.s_range_kPa[1],0)}</td><td class="num">${ksTxt(p.Ks_cm_h_median)}</td><td class="num">${p.Ks_cm_h_q25_q75.map(v=>v.toPrecision(2)).join('–')}</td><td class="num">${fx(p.loglog_slope_vs_Mualem,2)}</td></tr>`; });
  $('kTable').innerHTML = h+'</tbody>';
  h = '<thead><tr><th>Strato</th><th>K<sub>sat</sub> di laboratorio</th><th>K<sub>s</sub> di matrice dal drenaggio notturno</th><th>K<sub>s</sub> di matrice dopo la calibrazione sul drying (×'+fx(km,2)+')</th><th>Termine di macropori K<sub>mac</sub></th></tr></thead><tbody>';
  [['A1',zA1,GEO[0]],['A2',zA2,GEO[1]]].forEach(([l,z,g]) => h += `<tr><td><b>${l}</b></td><td class="num">${ksTxt(g.Ks*CMH)}</td><td class="num">${ksTxt(z.Ks_cm_h/km)}</td><td class="num">${ksTxt(z.Ks_cm_h)}</td><td class="num">${ksTxt(z.Kmac_cm_h)}${l==='A1'?' <span class="flag">scelto sul ruscellamento</span>':''}</td></tr>`);
  $('kTable2').innerHTML = h+'</tbody>';
  // --- 3. model tables
  h = '<thead><tr><th>Strato</th><th>Descrizione</th><th>Spessore</th><th>G<sub>s</sub></th><th>n</th><th>γ<sub>d</sub> [kN/m³]</th><th>K<sub>sat</sub> [m/s]</th><th>φ′ [°]</th><th>van Genuchten di laboratorio</th></tr></thead><tbody>';
  GEO.forEach(g => h += `<tr><td><b>${g.L}</b></td><td style="white-space:normal;min-width:170px">${g.d}</td><td>${g.thick}</td><td class="num">${g.Gs}</td><td class="num">${g.n}</td><td class="num">${fx(g.gd,2)}</td><td class="num">${g.Ks.toExponential(2)}</td><td class="num">${g.phi}</td><td>${g.vg}</td></tr>`);
  $('geoTable').innerHTML = h+'</tbody>';
  h = '<thead><tr><th>Parcella</th><th>Profondità [cm]</th><th>Strato</th><th>θr</th><th>θs</th><th>α [1/kPa]</th><th>n</th><th>K<sub>s</sub> matrice [cm/h]</th><th>K<sub>mac</sub> [cm/h]</th></tr></thead><tbody>';
  SITES.forEach(s => S2.sites[s].model.zones.forEach(z => { const p=S2.sites[s].fits[z.ret];
    h += `<tr><td><span class="pill" style="color:var(${COL[s]})">${s}</span></td><td class="num">${String(z.zTop_cm).replace('.',',')}–${String(z.zBot_cm).replace('.',',')}</td><td>${z.name}</td><td class="num">${fx(p.theta_r,3)}</td><td class="num">${fx(p.theta_s,3)}</td><td class="num">${fx(p.alpha,3)}</td><td class="num">${fx(p.n,2)}</td><td class="num">${fx(z.Ks_cm_h,3)}</td><td class="num">${fx(z.Kmac_cm_h,2)}</td></tr>`; }));
  $('zoneTable').innerHTML = h+'</tbody>';
  const M = {NV:S2.sites.NV.model, V:S2.sites.V.model}, at=S2.sites.NV.forcing.air_temperature;
  const rootTxt = m => m.roots.filter(r=>r[0]<=60&&r[0]>0).map(r=>`${r[0]} cm: ${String(r[1]).replace('.',',')} g`).join(' · ');
  const rows = [
    ['Dominio', m=>`pendio indefinito con inclinazione β = ${m.slope_deg}°: copertura piroclastica di ${m.L_cm} cm (profondità verticale) su dolomia fratturata, uniforme lungo il pendio; griglia Δz = ${m.dz_cm} cm in profondità verticale, ${m.L_cm/m.dz_cm+1} nodi`],
    ['Equazione', m=>`∂θ/∂t = ∂/∂n [K (∂h/∂n − cos β)] − S, con n normale al pendio; in profondità verticale z = n/cos β e flussi per unità di area orizzontale: ∂θ/∂t = ∂/∂z [(K/cos²β)(∂h/∂z − cos²β)] − S. Il flusso parallelo al pendio K·sen β è uniforme e non cambia l'invaso`],
    ['Bordo superiore', m=>`flusso atmosferico: pioggia al suolo meno evaporazione potenziale dalla superficie; se la superficie arriva a h = 0 passa a carico imposto (eccesso = ruscellamento); se scende sotto h = ${(m.hCrit_cm).toLocaleString('it-IT')} cm passa a carico imposto e l'evaporazione si riduce`],
    ['Bordo inferiore', m=>`drenaggio libero alla base (∂h/∂n = 0): flusso K per unità di area orizzontale`],
    ['Condizione iniziale', m=>`suzione misurata il ${dIt(S2.sites.NV.t_init)} alle tre profondità, interpolata linearmente`],
    ['Pioggia al suolo', (m,s)=>s==='V'?`serbatoio di intercettazione di ${String(S2.sites.V.forcing.interception_capacity_mm).replace('.',',')} mm (chiome 2–5, arbusti 1–3, erbe 0,5–2, lettiera 5–15 mm), svuotato dall'evaporazione potenziale; al suolo arriva solo il trabocco`:'tutta la pioggia misurata in campo aperto'],
    ['Evapotraspirazione potenziale', (m,s)=>`Oudin (2005) dalla temperatura dell'aria in campo aperto: misurata per ${at.measured_days} giorni (17/03–03/09/2025), stimata negli altri ${at.estimated_days} dalla temperatura del suolo a 15 cm (T<sub>aria</sub> = ${fx(at.regression.slope,2)}·T<sub>suolo</sub> ${fx(at.regression.intercept,1)} °C, R² ${fx(at.regression.r2,2)}); moltiplicata per ${fx(m.eFactor,2)} (calibrato sul drying)`],
    ['Ripartizione', m=>`quota assorbita dalle radici = 1 − e<sup>−k·LAI</sup> = ${fx(m.tFrac,2)} con LAI = ${m.LAI} e k = ${m.k_ext}; il resto è evaporazione dalla superficie`],
    ['Radici', m=>`biomassa radicale misurata ${rootTxt(m)}; profondità radicale 1 m; riduzione di Feddes: nessuna fino a 100 kPa, assorbimento nullo a 1500 kPa`],
    ['Conducibilità', m=>`K(h) = K<sub>s</sub> di matrice × Mualem (l = 0,5) + K<sub>mac</sub>·e<sup>h/${m.zones[0].hmac_cm} cm</sup>; a saturazione K = K<sub>s</sub> + K<sub>mac</sub>`],
    ['Schema numerico', m=>`Richards in forma mista, differenze finite implicite, Picard modificato (Celia et al., 1990); Δt adattivo fino a ${m.dtMax_h} h`]];
  h = '<thead><tr><th>Voce</th><th>Senza vegetazione</th><th>Vegetata</th></tr></thead><tbody>';
  rows.forEach(([k,f]) => { const a=f(M.NV,'NV'), b=f(M.V,'V'); h += `<tr><td><b>${k}</b></td>`+(a===b?`<td colspan="2" style="white-space:normal;text-align:left">${a}</td>`:`<td style="white-space:normal;text-align:left">${a}</td><td style="white-space:normal;text-align:left">${b}</td>`)+'</tr>'; });
  $('bcTable').innerHTML = h+'</tbody>';
  // --- 4. calibration performance
  h = '<thead><tr><th>Parcella</th><th>Fattore ETP</th><th>Moltiplicatore K<sub>s</sub> matrice</th><th>J drying 2025</th><th>J drying 2026</th><th>J senza calibrazione (1 · 1)</th><th>Minimo libero della griglia</th></tr></thead><tbody>';
  SITES.forEach(s => { const c=CAL(s), ch=c.chosen, Jc=c.grid_J[c.config.log10_kmult.indexOf(ch.log10_kmult)][c.config.eFactor.indexOf(ch.eFactor)];
    const Jm = w => { const d=c.dry[w], ks=Object.keys(d); return ks.reduce((a,k)=>a+d[k].rmse_Se/c.config.SIG_SE+d[k].rmse_log10s/c.config.SIG_LS,0)/ks.length; };
    h += `<tr><td>${pill(s)}</td><td class="num">${fx(ch.eFactor,2)}</td><td class="num">${fx(Math.pow(10,ch.log10_kmult),2)}${s==='V'?' <span class="flag">da NV</span>':''}</td><td class="num">${fx(Jc,2)}</td><td class="num">${fx(Jm('valid'),2)}</td><td class="num">${fx(c.prior.calib.J,2)}</td><td class="num">ETP ${fx(c.free_best.eFactor,2)} · K ×${fx(c.free_best.kmult,1)} · J ${fx(c.free_best.J,2)}${c.free_best.on_grid_edge?' <span class="flag">bordo griglia</span>':''}</td></tr>`; });
  $('candTable').innerHTML = h+'</tbody>';
  h = '<thead><tr><th>Parcella</th><th>Profondità</th><th>RMSE S<sub>e</sub> drying 2025</th><th>RMSE log₁₀s drying 2025</th><th>RMSE S<sub>e</sub> drying 2026</th><th>RMSE log₁₀s drying 2026</th><th>RMSE S<sub>e</sub> periodo completo</th><th>Bias S<sub>e</sub> periodo completo</th></tr></thead><tbody>';
  SITES.forEach(s => { const c=CAL(s); Object.keys(c.dry.calib).forEach(k => { const a=c.dry.calib[k], b=c.dry.valid[k], f=c.full[k];
    h += `<tr><td>${pill(s)}</td><td>${k} cm</td><td class="num">${fx(a.rmse_Se,2)}</td><td class="num">${fx(a.rmse_log10s,2)}</td><td class="num">${fx(b.rmse_Se,2)}</td><td class="num">${fx(b.rmse_log10s,2)}</td><td class="num">${fx(f.rmse,2)}</td><td class="num">${(f.bias>=0?'+':'')+fx(f.bias,2)}</td></tr>`; }); });
  $('perfTable').innerHTML = h+'</tbody>';
  { const Jc = s => { const c=CAL(s); return c.grid_J[c.config.log10_kmult.indexOf(c.chosen.log10_kmult)][c.config.eFactor.indexOf(c.chosen.eFactor)]; };
    const zs = s => S2.sites[s].model.zones, km = Math.pow(10,S2.params.NV.log10_kmult), kmV = Math.pow(10,BV.params.NV.log10_kmult);
    const rowsC = [
      ['K<sub>s</sub> di matrice dal drenaggio notturno, A1 · A2 [cm/h]', `${fx(BV.sites.NV.Ks_matrix_cm_h.A1/kmV,3)} · ${fx(BV.sites.NV.Ks_matrix_cm_h.A2/kmV,3)}`, `${fx(zs('NV')[0].Ks_cm_h/km,3)} · ${fx(zs('NV')[1].Ks_cm_h/km,3)}`],
      ['Fattore di ETP, senza vegetazione · vegetata', `${fx(BV.params.NV.eFactor,2)} · ${fx(BV.params.V.eFactor,2)}`, `${fx(S2.params.NV.eFactor,2)} · ${fx(S2.params.V.eFactor,2)}`],
      ['Moltiplicatore della K di matrice', fx(kmV,2), fx(km,2)],
      ['Errore J nel drying 2025, senza vegetazione · vegetata', `${fx(BV.sites.NV.J_chosen,2)} · ${fx(BV.sites.V.J_chosen,2)}`, `${fx(Jc('NV'),2)} · ${fx(Jc('V'),2)}`],
      ['RMSE S<sub>e</sub> sul periodo completo, senza vegetazione · vegetata', `${fx(BV.sites.NV.full.mean,3)} · ${fx(BV.sites.V.full.mean,3)}`, `${fx(CAL('NV').full.mean,3)} · ${fx(CAL('V').full.mean,3)}`],
      ['Drenaggio alla base [mm], senza vegetazione · vegetata', `${it(BV.sites.NV.massBalance.drainage_mm)} · ${it(BV.sites.V.massBalance.drainage_mm)}`, `${it(MB('NV').drainage_mm)} · ${it(MB('V').drainage_mm)}`],
      ['Evapotraspirazione reale [mm], senza vegetazione · vegetata', `${it(BV.sites.NV.massBalance.evaporation_mm+BV.sites.NV.massBalance.transpiration_mm)} · ${it(BV.sites.V.massBalance.evaporation_mm+BV.sites.V.massBalance.transpiration_mm)}`, `${it(MB('NV').evaporation_mm+MB('NV').transpiration_mm)} · ${it(MB('V').evaporation_mm+MB('V').transpiration_mm)}`],
      ['Flusso lungo il pendio attraverso la colonna [m³ per m di larghezza], senza vegetazione · vegetata', '–', `${fx(MB('NV').lateral_throughflow_m3_per_m,2)} · ${fx(MB('V').lateral_throughflow_m3_per_m,2)}`]];
    let hc = `<thead><tr><th>Confronto fra le due schematizzazioni</th><th>Colonna verticale</th><th>Pendio indefinito, β = ${BETA}°</th></tr></thead><tbody>`;
    rowsC.forEach(r => hc += `<tr><td style="white-space:normal">${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td></tr>`);
    $('slopeTable').innerHTML = hc+'</tbody>'; }
  // --- 5. infiltration
  const sm=EV.summary, dry=sm['dry_season(May-Sep)'], wetS=sm['wet_season(Oct-Apr)'];
  h = '<thead><tr><th>Dai sensori, per evento (colonna 0–75 cm)</th><th>Eventi</th><th>Pioggia [mm]</th><th>Accumulo senza veg. [mm]</th><th>Accumulo vegetata [mm]</th><th>Vegetata / senza veg.</th></tr></thead><tbody>';
  const rowE=(l,n,P,a,b)=>`<tr><td>${l}</td><td class="num">${n}</td><td class="num">${it(P)}</td><td class="num">${it(a)} (${Math.round(a/P*100)}%)</td><td class="num">${it(b)} (${Math.round(b/P*100)}%)</td><td class="num">${fx(b/a,2)}</td></tr>`;
  h += rowE('Tutti gli eventi con dati in entrambe le parcelle',sm.n_both,sm.sum_P,sm.sum_dS_NV,sm.sum_dS_V)+rowE('Maggio–settembre',dry.n,dry.P,dry.dS_NV,dry.dS_V)+rowE('Ottobre–aprile',wetS.n,wetS.P,wetS.dS_NV,wetS.dS_V);
  $('infTable').innerHTML = h+'</tbody>';
  const Pg=FT('NV').P_gross_mm, inf = s => FT(s).P_net_mm - MB(s).runoff_mm, rng=FT('V').net_fraction_for_capacity_range;
  h = `<thead><tr><th>Dal modello, ${dIt(S2.t0)} → ${dIt(T[nH-1])} [mm]</th><th>Senza vegetazione</th><th>Vegetata</th></tr></thead><tbody>`;
  [['Pioggia in campo aperto',s=>Pg],['Intercettata ed evaporata prima del suolo',s=>FT(s).interception_evaporation_mm],['Pioggia che arriva al suolo',s=>FT(s).P_net_mm],['Ruscellamento',s=>MB(s).runoff_mm],['<b>Infiltrazione</b>',s=>inf(s)]]
    .forEach(([l,f]) => h += `<tr><td>${l}</td><td class="num">${it(f('NV'))} (${Math.round(f('NV')/Pg*100)}%)</td><td class="num">${it(f('V'))} (${Math.round(f('V')/Pg*100)}%)</td></tr>`);
  h += `<tr><td>Infiltrazione vegetata / senza vegetazione</td><td colspan="2" class="num">${fx(inf('V')/inf('NV'),2)} (fra ${fx(Object.values(rng)[1],2)} e ${fx(Object.values(rng)[0],2)} per capacità di intercettazione fra 25 e 8,5 mm)</td></tr>`;
  h += `<tr><td>Riferimenti in sito</td><td colspan="2" style="white-space:normal">pioggia al suolo ricostruita sotto bosco in due eventi del 2025: 17 mm su 29 (59%) e 56 mm su 84 (67%); pluviometro sotto chioma 15/01–14/02/2026: 49%</td></tr>`;
  $('infModel').innerHTML = h+'</tbody>';
  const wb = [['Pioggia al suolo',s=>FT(s).P_net_mm],['Ruscellamento',s=>MB(s).runoff_mm],['Evaporazione dalla superficie',s=>MB(s).evaporation_mm],['Assorbimento radicale',s=>MB(s).transpiration_mm],['Drenaggio alla base',s=>MB(s).drainage_mm],['Variazione d\'invaso',s=>MB(s).dS_mm]];
  h = `<thead><tr><th>Bilancio del suolo ${dIt(S2.t0)} → ${dIt(T[nH-1])} [mm]</th><th>Senza vegetazione</th><th>Vegetata</th></tr></thead><tbody>`;
  wb.forEach(([l,f]) => h += `<tr><td>${l}</td><td class="num">${it(f('NV'))}</td><td class="num">${it(f('V'))}</td></tr>`);
  h += `<tr><td>Errore di chiusura</td><td class="num">${fx(MB('NV').error_mm,3)}</td><td class="num">${fx(MB('V').error_mm,3)}</td></tr>`;
  $('wbTable').innerHTML = h+'</tbody>';
  // --- solver verification
  { let hv = '<thead><tr><th>Caso di prova</th><th>Griglia Δz [cm]</th><th>Scarto massimo sul profilo (log₁₀ carico)</th><th>Flusso in superficie [mm]: solutore · riferimento</th><th>Drenaggio alla base [mm]: solutore · riferimento</th><th>Errore di bilancio [mm]</th></tr></thead><tbody>';
    const nm = {T1:'Essiccamento per solo assorbimento radicale, 40 giorni', T2:'Pioggia di 2 mm/h per 24 h in terreno secco, poi ridistribuzione (96 h)', T3:'Evaporazione con superficie al carico limite, 20 giorni'};
    VF.summary.forEach(r => hv += `<tr><td style="white-space:normal">${nm[r.case]}</td><td class="num">${String(r.dz).replace('.',',')}${r.dz===VF.dz_model?' <span class="flag">modello</span>':''}</td><td class="num">${fx(r.max_dlog10_h,3)}</td><td class="num">${fx(r.surface_sim_mm,2)} · ${fx(r.surface_ref_mm,2)}</td><td class="num">${fx(r.drain_sim_mm,2)} · ${fx(r.drain_ref_mm,2)}</td><td class="num">${fx(r.mass_error_mm,4)}</td></tr>`);
    $('verTable').innerHTML = hv+'</tbody>'; }
  // --- notes
  const cN=CAL('NV'), cV=CAL('V'), mN=cN.series.calib.massBalance, mV=cV.series.calib.massBalance, a1=SW.shared.A1, a2=SW.shared.A2, sc=S2.kmacScan.NV;
  const notes = [
    `<b>Curva principale e saturazione efficace.</b> Per ogni sensore la curva principale di drying è l'inviluppo superiore dei punti di essiccamento (95° percentile di θ per classe di suzione, reso non crescente). In termini di S<sub>e</sub> = (θ − θ<sub>r</sub>)/(θ<sub>s</sub> − θ<sub>r</sub>) i sensori dello stesso strato si sovrappongono: una sola curva descrive A2 in entrambe le parcelle (1/α = ${fx(1/a2.alpha,0)} kPa, n = ${fx(a2.n,2)}) e una A1 (1/α = ${fx(1/a1.alpha,1)} kPa, n = ${fx(a1.n,2)}), con uno scarto su S<sub>e</sub> di 0,02–0,05. Le differenze di θ fra le parcelle stanno quindi in θ<sub>r</sub> e θ<sub>s</sub> di ciascun sensore, non nella forma della curva.`,
    `<b>θ<sub>r</sub> e confronto con il laboratorio.</b> θ<sub>r</sub> non può superare il minimo θ osservato dal sensore, e in quasi tutti i sensori finisce su quel limite: i dati non arrivano alla zona residua. I valori di n (${fx(a1.n,2)} e ${fx(a2.n,2)}) sono più alti di quelli delle curve medie usate prima (fino a 1,17) ma restano sotto quelli di laboratorio (1,79–1,82); l'ingresso d'aria è nell'ordine dei 5–10 kPa di laboratorio. Con la calibrazione per terreno θ<sub>s</sub> di campo va da ${fx(Math.min(...Object.values(SW.sensors).map(v=>v.params.theta_s)),2)} a ${fx(Math.max(...Object.values(SW.sensors).map(v=>v.params.theta_s)),2)} (laboratorio 0,52–0,53): solo il sensore a 60 cm senza vegetazione si avvicina alla saturazione di laboratorio.`,
    `<b>Conducibilità non satura.</b> Nelle notti senza pioggia il flusso in superficie è nullo, quindi la perdita d'invaso sopra un piano è il flusso che lo attraversa: K si ricava senza alcuna stima di evapotraspirazione. Fra 10 e 40 kPa K è 0,001–0,006 cm/h, cioè 10–40 volte meno di quanto darebbe la K<sub>sat</sub> di laboratorio con Mualem. La K<sub>sat</sub> di laboratorio descrive i pori grandi, attivi solo vicino alla saturazione: per questo il modello ha due termini. Vicino al limite di risoluzione dei sensori (flussi sotto circa 1 mm/giorno) i punti sono incerti e la pendenza osservata è minore di quella di Mualem.`,
    `<b>Due strati.</b> Il modello ha uno strato per ogni unità stratigrafica che è riconosciuta nei sondaggi, ha proprietà idrauliche misurate diverse ed è strumentata: A1 (0–20 cm) e A2 (20–${S2.sites.NV.model.L_cm} cm), come nel modello 1D presentato all'ALERT 2025. C1 è sottile, discontinuo, non strumentato e con K<sub>sat</sub> di laboratorio entro un fattore 2 da A2: è accorpato ad A2. Lo strato A2 non è più suddiviso per sensore, perché i sensori seguono la stessa curva in S<sub>e</sub>. Ogni strato ha una sola curva, uguale nelle due parcelle, con θ<sub>r</sub> e θ<sub>s</sub> pari alla media dei suoi sensori: le parcelle differiscono solo per la vegetazione. θ<sub>r</sub> e θ<sub>s</sub> dei singoli sensori servono solo a convertire le misure in S<sub>e</sub>.`,
    `<b>Come leggere i profili.</b> La suzione è continua con la profondità; S<sub>e</sub> ha un solo salto, a 20 cm, dove cambia il terreno. Il valore molto alto nel primo centimetro è il limite di essiccamento all'aria imposto in superficie quando l'evaporazione è limitata dal suolo. Il tratto quasi verticale intorno a 1500 kPa nella zona delle radici è la soglia di appassimento: sopra quella suzione le radici non assorbono più, e solo l'evaporazione dalla superficie può andare oltre. Sotto i 60 cm non ci sono misure: il profilo calcolato lì dipende dalla profondità radicale (1 m) e dal drenaggio libero alla base.`,
    `<b>Verifica del solutore.</b> Tre casi di prova (assorbimento radicale, infiltrazione, evaporazione) sono stati risolti anche con un codice indipendente su griglia più fitta. I profili coincidono e gli scarti si riducono infittendo la griglia. L'unica differenza apprezzabile è nell'evaporazione dalla superficie, sovrastimata di circa il 9% con Δz = 1 cm e di circa il 3% con Δz = 0,5 cm: per questo il modello usa ora 0,5 cm.`,
    `<b>Pendio indefinito.</b> Con tutte le grandezze uniformi lungo il pendio conta solo il flusso normale alla superficie: la gravità agisce con cos β e i gradienti di pressione sono più forti a parità di profondità verticale. Il flusso parallelo al pendio attraversa la colonna ma entra da monte quanto esce a valle, quindi non cambia il bilancio. Rispetto alla colonna verticale i risultati cambiano poco: l'errore nel drying 2025 passa da ${fx(BV.sites.NV.J_chosen,2)} a ${fx(cN.free_best.J,2)} senza vegetazione, e i fattori calibrati restano simili. Profondità di strati, sensori e radici sono intese come verticali.`,
    `<b>Flusso lungo il pendio.</b> In tutto il periodo attraversano la colonna ${fx(MB('NV').lateral_throughflow_m3_per_m,2)} m³ per metro di larghezza, quasi tutti nei mesi piovosi. Nel drying 2025 sono solo ${fx(EX.NV.lateral_m3_per_m*1000,0)} litri per metro: anche se non fossero rimpiazzati da monte, toglierebbero pochi millimetri. Il deflusso laterale non spiega quindi la perdita d'acqua estiva, contrariamente a quanto avevo ipotizzato.`,
    `<b>Calibrazione sul drying, parcella senza vegetazione.</b> Con curve, K di matrice, radici e ripartizione fissate da misure indipendenti restano due fattori. Il minimo è interno alla griglia: ETP × ${fx(cN.chosen.eFactor,2)} e K di matrice × ${fx(Math.pow(10,cN.chosen.log10_kmult),1)}; l'errore scende da ${fx(cN.prior.calib.J,2)} (senza calibrazione) a ${fx(cN.free_best.J,2)}. Il fattore di ETP alto pesa poco sui volumi: nel drying 2025 l'evapotraspirazione reale è ${it(EX.NV.ET_cal_mm)} mm con il fattore calibrato e ${it(EX.NV.ET_factor1_mm)} mm con fattore 1, su ${it(EX.NV.PE_window_mm)} mm di potenziale, perché è il suolo a limitare il flusso. Il fattore regola soprattutto la velocità con cui si asciuga lo strato superficiale a inizio stagione.`,
    `<b>Parcella vegetata.</b> Il terreno è lo stesso, quindi il moltiplicatore di K è quello della parcella senza vegetazione e si calibra solo l'ETP: × ${fx(cV.chosen.eFactor,2)}. Lasciando liberi entrambi i fattori il minimo dà la stessa ETP (× ${fx(cV.free_best.eFactor,2)}) e una K più alta (× ${fx(cV.free_best.kmult,1)}), con errore ${fx(cV.free_best.J,2)} invece di ${fx(cV.chosen.J_grid,2)}. Il fattore di ETP è quindi ben identificato in entrambe le parcelle: il bosco asciuga il profilo molto meno di quanto la domanda atmosferica farebbe attendere, il che è compatibile con radici che attingono anche sotto il metro o nella roccia fratturata, e con la parte di evaporazione già spesa sull'acqua intercettata.`,
    `<b>Acqua persa nel drying 2025 (26/04–28/08).</b> Invaso dell'intera copertura: −${it(-mN.dS_mm)} mm senza vegetazione, −${it(-mV.dS_mm)} mm nella vegetata. Evapotraspirazione reale simulata ${it(mN.evaporation_mm+mN.transpiration_mm)} mm contro ${it(mV.evaporation_mm+mV.transpiration_mm)} mm; drenaggio alla base ${it(mN.drainage_mm)} mm contro ${it(mV.drainage_mm)} mm.`,
    `<b>Validazione sul drying 2026.</b> L'errore cresce, soprattutto a 15 e 30 cm nella parcella senza vegetazione, dove le piogge estive del 2026 sono frequenti: il modello usa solo la curva di drying e non l'isteresi delle fasi di imbibizione.`,
    `<b>Macropori dello strato A1.</b> Con la K<sub>sat</sub> di laboratorio di A1 il modello dà ${it(sc[0].runoff_mm)} mm di ruscellamento, che in sito non si osserva. L'errore su S<sub>e</sub> cambia poco al variare di K<sub>mac</sub> (${sc.map(v=>fx(v.rmse_Se_mean,3)).join(' · ')} per ${sc.map(v=>fx(v.Kmac_A1_cm_h,v.Kmac_A1_cm_h<1?2:0)).join(' · ')} cm/h), quindi è stato scelto il valore più piccolo che porta il ruscellamento sotto il 2% della pioggia.`,
    `<b>Infiltrazione.</b> Nel modello l'intercettazione non è calibrata: usa le capacità dei quattro strati di vegetazione riportate in sito. Ne risulta che al suolo sotto bosco arriva il ${Math.round(FT('V').net_fraction*100)}% della pioggia, in accordo con il 59–67% ricostruito in sito in due eventi. I sensori vedono molto meno (${Math.round(sm.frac_V*100)}% contro ${Math.round(sm.frac_NV*100)}%), ma è un limite inferiore: non conta l'acqua che supera i 75 cm o resta sopra il sensore a 15 cm.`,
    `<b>Calibrazione di θ.</b> Dal file calibrato della parcella senza vegetazione (fino al ${dIt(TC.calibrated_file_last_time)}) sono state ricavate due funzioni dell'uscita del sensore in mV: una per A1 (15 cm) e una per A2 (30 e 60 cm, identica), che riproducono il file con uno scarto di ${fx(Math.max(TC.functions.A1.rmse,TC.functions.A2.rmse),4)} m³/m³. In quel file θ è in ritardo di un'ora rispetto alla suzione (e al θ grezzo): il ritardo è stato tolto. Le funzioni sono applicate a tutta la serie e anche alla parcella vegetata, assumendo stessi terreni e stessi sensori; a 60 cm nella vegetata il ${Math.round(TC.applied.V_60.frac_extrapolated*100)}% delle misure è sotto il campo coperto dalla calibrazione.`,
    `<b>Temperature.</b> La temperatura dell'aria misurata in campo aperto (a 40 cm dal suolo, 17/03–03/09/2025) copre tutto il drying 2025; per il resto è stimata dalla temperatura del suolo, che in media è 3 °C più alta. Il sensore a 40 cm dal suolo tocca 49 °C nelle ore calde: la media giornaliera può essere sovrastimata.`,
    `<b>Ipotesi rimaste.</b> k = 0,5 nella ripartizione con il LAI; lunghezza di decadimento dei macropori 5 cm (il valore più grande compatibile con i punti di K sotto 5 kPa, entro l'accuratezza di ±2 kPa del sensore di suzione); passaggio A1/A2 a 20 cm; pendio indefinito con β = ${fx(BETA,0)}° (pendenza media adottata; le slide ALERT riportano 32°, il lavoro 25–30°, localmente oltre 35°: con 32° i due fattori calibrati restano uguali e il bilancio cambia di pochi millimetri); profondità dei sensori intese come verticali; nessuna isteresi.`];
  $('dryNotes').innerHTML = notes.map(x=>'<li>'+x+'</li>').join('');
  $('colsvg').innerHTML = columnSVG();
}

function columnSVG(){
  const sc = 2.6, top = 92, colW = 124, gap = 200, x0 = 92, Lc = S2.sites.NV.model.L_cm;
  const W = x0 + 2*colW + gap + 150, H = top + Lc*sc + 70, y = z => top + z*sc;
  let g = '';
  SITES.forEach((s,k) => {
    const M = S2.sites[s].model, x = x0 + k*(colW+gap);
    g += `<text x="${x+colW/2}" y="18" text-anchor="middle" font-weight="600" style="fill:var(${COL[s]})">${LABEL[s]}</text>`;
    g += `<g style="stroke:var(--wet);fill:var(--wet)"><line x1="${x+20}" y1="30" x2="${x+20}" y2="${top-6}" stroke-width="1.5"/><path d="M${x+15},${top-12} l5,7 l5,-7z"/></g>`;
    g += `<text x="${x+28}" y="42" style="fill:var(--muted)" font-size="11">${k===1?'P − intercettazione':'P'}</text>`;
    g += `<g style="stroke:var(--dry);fill:var(--dry)"><line x1="${x+colW-20}" y1="${top-6}" x2="${x+colW-20}" y2="46" stroke-width="1.5"/><path d="M${x+colW-25},52 l5,-7 l5,7z"/></g>`;
    g += `<text x="${x+colW-28}" y="72" text-anchor="end" style="fill:var(--muted)" font-size="11">E</text>`;
    if (k===1) g += `<g style="stroke:var(--veg)" stroke-width="1.5" fill="none"><path d="M${x+colW/2-14},${top-8} q-6,-18 4,-32 M${x+colW/2+6},${top-8} q8,-20 -2,-34"/></g>`;
    else g += `<g style="stroke:var(--veg)" stroke-width="1.2" fill="none"><path d="M${x+colW/2-8},${top-2} l-4,-12 M${x+colW/2},${top-2} l0,-14 M${x+colW/2+8},${top-2} l4,-12"/></g>`;
    M.zones.forEach(z => { const fillv = z.name==='A1'?'--soilA1':z.name==='A2'?'--soilA2':'--soilC1';
      g += `<rect x="${x}" y="${y(z.zTop_cm)}" width="${colW}" height="${(z.zBot_cm-z.zTop_cm)*sc}" style="fill:var(${fillv});stroke:var(--line)"/>`;
      g += `<text x="${x+6}" y="${y(z.zTop_cm)+14}" font-size="11" style="fill:var(--fg)">${z.name}</text>`;
      g += `<text x="${x+6}" y="${y(z.zTop_cm)+27}" font-size="10" style="fill:var(--muted)">K matrice ${fx(z.Ks_cm_h,2)} cm/h</text>`; });
    g += `<rect x="${x}" y="${y(Lc)}" width="${colW}" height="18" style="fill:var(--rock)"/><text x="${x+colW/2}" y="${y(Lc)+13}" text-anchor="middle" font-size="10" style="fill:var(--fg)">dolomia fratturata</text>`;
    g += `<text x="${x+colW/2}" y="${y(Lc)+34}" text-anchor="middle" font-size="11" style="fill:var(--muted)">drenaggio libero · β = ${M.slope_deg}°</text>`;
    Object.keys(S2.sites[s].Se).forEach(d => { g += `<circle cx="${x+colW-14}" cy="${y(+d)}" r="5" style="fill:var(--panel);stroke:var(--fg)" stroke-width="1.5"/><text x="${x+colW+8}" y="${y(+d)+4}" font-size="11" style="fill:var(--fg)">${d} cm</text>`; });
    const rx = x + colW + 52, rw = 70, R = M.roots, mx = Math.max(...R.map(r=>r[1]));
    let path = `M${rx},${y(R[0][0])}`; R.forEach(r => path += ` L${rx + r[1]/mx*rw},${y(r[0])}`); path += ` L${rx},${y(R[R.length-1][0])} Z`;
    g += `<path d="${path}" style="fill:var(--veg);opacity:.25;stroke:var(--veg)"/><line x1="${rx}" y1="${y(0)}" x2="${rx}" y2="${y(Lc)}" style="stroke:var(--line)"/>`;
    g += `<text x="${rx}" y="${top-6}" font-size="10" style="fill:var(--muted)">radici (misurate)</text>`;
  });
  for (let z=0; z<=Lc; z+=10) g += `<line x1="${x0-6}" y1="${y(z)}" x2="${x0}" y2="${y(z)}" style="stroke:var(--muted)"/>`+(z%20===0||z===Lc?`<text x="${x0-10}" y="${y(z)+4}" text-anchor="end" font-size="10" style="fill:var(--muted)">${z}</text>`:'');
  g += `<text x="${x0-44}" y="${y(Lc/2)}" font-size="11" style="fill:var(--muted)" transform="rotate(-90 ${x0-44} ${y(Lc/2)})" text-anchor="middle">profondità z [cm]</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Schema delle due colonne di terreno modellate" style="font-family:var(--f-body)">${g}</svg>`;
}

const SEASON_COL = { '2025':['#f0c27e','#e09a4a','#c4722c','#93501b','#5e3310'], '2026':['#a7cdea','#6ea8d8','#3f80bf','#245d9b','#103a69'] };
function instColors(M){ const dark = parseInt(css('--bg').slice(1,3),16) < 128, c={'2025':0,'2026':0};   // on a dark surface the latest instant is the lightest
  return M.profileInstants.map(s=>{ const y=s.slice(0,4), pal=dark?SEASON_COL[y].slice().reverse():SEASON_COL[y]; return pal[c[y]++]; }); }

function plots(){
  const fg=css('--fg'), mu=css('--muted'), gr=css('--grid'), ln=css('--line'), pn=css('--panel');
  const base = (xt,yt) => ({ paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{family:css('--f-body'),size:12,color:fg},
    margin:{l:56,r:12,t:30,b:44}, hovermode:'closest', showlegend:true, legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}},
    xaxis:{title:{text:xt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}},
    yaxis:{title:{text:yt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}} });
  const cfgP={displaylogo:false,responsive:true,modeBarButtonsToRemove:['lasso2d','select2d']};
  // 1. Se curves per layer
  ['A1','A2'].forEach(lay => { const sh=SW.shared[lay], tr=[], sym={NV:'circle',V:'diamond'};
    Object.keys(sh.sensors).forEach(key => { const R=SW.sensors[key], c=css(SHADE[key]), nm=`${LABEL[R.site]} ${R.depth_cm} cm`;
      tr.push({type:'scatter',mode:'markers',x:R.envelope.s,y:sh.sensors[key].Se_env,name:nm,marker:{size:8,color:c,symbol:sym[R.site],line:{width:1,color:pn}},hovertemplate:nm+'<br>s = %{x:.1f} kPa<br>S<sub>e</sub> = %{y:.2f}<extra>inviluppo</extra>'}); });
    const xs=SW.sensors[Object.keys(sh.sensors)[0]].curve.s;
    tr.push({type:'scatter',mode:'lines',x:xs,y:xs.map(s=>seVG(s,sh.alpha,sh.n)),name:'curva comune '+lay,line:{color:fg,width:2.5},hovertemplate:'curva comune<br>s = %{x:.1f} kPa<br>S<sub>e</sub> = %{y:.2f}<extra></extra>'});
    const L=base('suzione s [kPa]','saturazione efficace S<sub>e</sub>'); L.xaxis.type='log'; L.xaxis.dtick=1; L.xaxis.range=[-0.05,Math.log10(5000)]; L.yaxis.range=[-0.03,1.08];
    PR('se-'+lay,tr,L,cfgP); });
  // 2. K(s)
  { const tr=[], sy={NV:'circle',V:'diamond'}, cl={'NV 22.5 cm':'--nv','NV 45 cm':'--dry','V 25 cm':'--veg','V 47.5 cm':'--wet'};
    Object.entries(KF.planes).forEach(([k,p]) => { const s=k.split(' ')[0], nm=`${LABEL[s]} · piano a ${k.slice(s.length+1)}`;
      tr.push({type:'scatter',mode:'markers',x:p.points.s_kPa,y:p.points.K_cm_h,text:p.points.date.map(dIt),name:nm,marker:{size:7,color:css(cl[k]),symbol:sy[s],opacity:.75},hovertemplate:'%{text}<br>s = %{x:.1f} kPa<br>K = %{y:.2g} cm/h<extra>'+nm+'</extra>'}); });
    const a2=SW.shared.A2, z=S2.sites.NV.model.zones[1], xs=[]; for(let e=-0.3;e<=2.5;e+=0.05) xs.push(Math.pow(10,e));
    const kr=xs.map(s=>krMualem(s,a2.alpha,a2.n,S2.sites.NV.model.hs_cm));
    tr.push({type:'scatter',mode:'lines',x:xs,y:xs.map((s,i)=>z.Ks_cm_h*kr[i]+z.Kmac_cm_h*Math.exp(-s*CM_PER_KPA/z.hmac_cm)),name:'modello A2 (matrice + macropori)',line:{color:fg,width:2.5},hovertemplate:'modello<br>s = %{x:.1f} kPa<br>K = %{y:.2g} cm/h<extra></extra>'});
    tr.push({type:'scatter',mode:'lines',x:xs,y:xs.map((s,i)=>GEO[1].Ks*CMH*kr[i]),name:'K<sub>sat</sub> di laboratorio × Mualem',line:{color:mu,width:1.5,dash:'dot'},hovertemplate:'laboratorio × Mualem<br>s = %{x:.1f} kPa<br>K = %{y:.2g} cm/h<extra></extra>'});
    const L=base('suzione s [kPa]','conducibilità K [cm/h]'); L.xaxis.type='log'; L.yaxis.type='log'; L.xaxis.dtick=1; L.yaxis.dtick=1; L.yaxis.range=[-5.2,1]; L.xaxis.range=[-0.3,2.5];
    PR('kPlot',tr,L,cfgP); }
  // verification profiles: reference (lines) vs solver (markers)
  ['T1','T2','T3'].forEach(cn => { const c=VF.ref.cases[cn], zr=VF.ref.z_cm, sim=VF.sim[cn][VF.dz_model], pal=['#c9a227','#8a5a9e','#2b7a8c','#b0651f'], tr=[];
    c.hours.forEach((hr,j) => { const lab = hr>=48 ? (hr/24)+' giorni' : hr+' h';
      tr.push({type:'scatter',mode:'lines',x:c.profiles[hr].map(v=>Math.max(-v/CM_PER_KPA,0.05)),y:zr,name:lab,legendgroup:lab,line:{color:pal[j],width:2},hovertemplate:lab+'<br>z = %{y} cm<br>s = %{x:.1f} kPa<extra>riferimento</extra>'});
      tr.push({type:'scatter',mode:'markers',x:sim[hr].filter((_,i)=>i%5===0).map(v=>Math.max(-v/CM_PER_KPA,0.05)),y:zr.filter((_,i)=>i%5===0),legendgroup:lab,showlegend:false,marker:{size:6,color:pal[j],symbol:'circle-open',line:{width:1.5}},hovertemplate:lab+'<br>z = %{y} cm<br>s = %{x:.1f} kPa<extra>solutore</extra>'}); });
    const L=base('suzione s [kPa]','profondità z [cm]'); L.yaxis.autorange='reversed'; L.xaxis.type='log'; L.legend.font.size=10;
    PR('ver-'+cn,tr,L,cfgP); });
  // 4. J maps
  SITES.forEach(s => { const c=CAL(s), ef=c.config.eFactor, lk=c.config.log10_kmult, zmin=Math.min(...c.grid_J.flat());
    const tr=[{type:'heatmap',x:ef,y:lk,z:c.grid_J,zmin,zmax:zmin*2.2,colorscale:[[0,'#143d6b'],[0.5,'#7fa9d1'],[1,'#eef3f8']],colorbar:{title:{text:'J',font:{color:mu}},thickness:10,outlinewidth:0,tickfont:{color:mu,size:10}},hovertemplate:'ETP × %{x}<br>K × 10^%{y}<br>J = %{z:.2f}<extra></extra>'},
      {type:'scatter',mode:'markers',x:[c.chosen.eFactor],y:[c.chosen.log10_kmult],name:'usato',marker:{size:14,symbol:'circle-open',color:'#ffffff',line:{width:3,color:'#d1495b'}},hovertemplate:'usato<extra></extra>'},
      {type:'scatter',mode:'markers',x:[1],y:[0],name:'senza calibrazione',marker:{size:11,symbol:'x-thin',line:{width:2.5,color:'#f2c14e'}},hovertemplate:'senza calibrazione<extra></extra>'}];
    if (c.free_best.eFactor!==c.chosen.eFactor || c.free_best.log10_kmult!==c.chosen.log10_kmult) tr.push({type:'scatter',mode:'markers',x:[c.free_best.eFactor],y:[c.free_best.log10_kmult],name:'minimo libero',marker:{size:11,symbol:'diamond-open',line:{width:2.5,color:'#f2c14e'}},hovertemplate:'minimo libero<extra></extra>'});
    const L=base('fattore di ETP','moltiplicatore della K di matrice'); L.yaxis.tickvals=[-1,-0.5,0,0.5,1,1.5]; L.yaxis.ticktext=['0,1','0,3','1','3','10','30']; L.margin.r=4;
    PR('jm-'+s,tr,L,cfgP); });
  // drying windows
  SITES.forEach(s => { const R=S2.sites[s], D=CAL(s), ks=Object.keys(R.Se), shade=['#c9a227','#8a5a9e','#2b7a8c'], tr=[];
    ks.forEach((k,j) => { const xs=[], ot=[], os=[], st=[], ss=[];
      Object.values(D.series).forEach(w => { for(let i=w.i0+1;i<=w.i1;i+=3){ const q=i-w.i0-1; xs.push(T[i]); ot.push(R.obsSe[k][i]); os.push(R.obs_s[k][i]); st.push(w.Se[k][q]); ss.push(w.s_kPa[k][q]); } xs.push(null); ot.push(null); os.push(null); st.push(null); ss.push(null); });
      tr.push({type:'scatter',mode:'lines',x:xs,y:ot,name:k+' cm misurato',legendgroup:k+'o',line:{color:shade[j],width:1},opacity:.5,yaxis:'y',hovertemplate:'%{x}<br>S<sub>e</sub> = %{y:.2f}<extra>'+k+' cm misurato</extra>'});
      tr.push({type:'scatter',mode:'lines',x:xs,y:st,name:k+' cm simulato',legendgroup:k+'s',line:{color:shade[j],width:2},yaxis:'y',hovertemplate:'%{x}<br>S<sub>e</sub> = %{y:.2f}<extra>'+k+' cm simulato</extra>'});
      tr.push({type:'scatter',mode:'lines',x:xs,y:os,legendgroup:k+'o',showlegend:false,line:{color:shade[j],width:1},opacity:.5,yaxis:'y2',hovertemplate:'%{x}<br>s = %{y:.0f} kPa<extra>'+k+' cm misurato</extra>'});
      tr.push({type:'scatter',mode:'lines',x:xs,y:ss,legendgroup:k+'s',showlegend:false,line:{color:shade[j],width:2},yaxis:'y2',hovertemplate:'%{x}<br>s = %{y:.0f} kPa<extra>'+k+' cm simulato</extra>'}); });
    const L=base('',''); L.margin={l:60,r:12,t:44,b:34}; L.hovermode='x unified'; L.legend.font.size=10;
    L.xaxis={type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y2',rangebreaks:[{bounds:[T[D.series.calib.i1],T[D.series.valid.i0]]}]};
    L.yaxis={title:{text:'S<sub>e</sub>',font:{color:mu,size:11}},domain:[0.54,1],gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}};
    L.yaxis2={title:{text:'suzione [kPa]',font:{color:mu,size:11}},domain:[0,0.46],type:'log',dtick:1,gridcolor:gr,linecolor:ln,tickfont:{color:mu}};
    PR('dw-'+s,tr,L,cfgP); });
  // 5. infiltration scatter
  { const tr=[]; SITES.forEach(s => { const e=EV.events.filter(v=>v['dS_'+s]!=null);
      tr.push({type:'scatter',mode:'markers',x:e.map(v=>v.P_mm),y:e.map(v=>v['dS_'+s]),text:e.map(v=>dIt(v.start)),name:LABEL[s],marker:{size:9,color:css(COL[s]),opacity:.8,symbol:s==='V'?'diamond':'circle',line:{width:1,color:pn}},hovertemplate:'%{text}<br>pioggia %{x:.0f} mm<br>accumulo %{y:.0f} mm<extra>'+LABEL[s]+'</extra>'}); });
    tr.push({type:'scatter',mode:'lines',x:[0,210],y:[0,210],name:'accumulo = pioggia',line:{color:mu,width:1,dash:'dot'},hoverinfo:'skip'});
    const L=base('pioggia cumulata dell\'evento [mm]','acqua accumulata in 0–75 cm [mm]'); L.yaxis.range=[-5,100]; L.xaxis.range=[0,215];
    PR('infPlot',tr,L,cfgP); }
  // 6. profiles
  SITES.forEach(s => { const R=S2.sites[s], M=R.model, cols=instColors(M), z=R.z_cm;
    for (const v of ['Se','s']) { const tr=[];
      M.profileHours.forEach((hr,k) => { const P=R.profiles[hr], lab=dIt(M.profileInstants[k]), dash=M.profileInstants[k].startsWith('2026')?'dash':'solid';
        const x = v==='Se'?P.Se:P.s_kPa.map(q=>Math.max(q,0.1));
        tr.push({type:'scatter',mode:'lines',x,y:z,name:lab,legendgroup:lab,line:{color:cols[k],width:2,dash},hovertemplate:`${lab}<br>z = %{y} cm<br>${v==='Se'?'S<sub>e</sub> = %{x:.2f}':'s = %{x:.1f} kPa'}<extra>simulato</extra>`});
        const od=Object.keys(P.obs), ox=od.map(d=>v==='Se'?P.obs[d].Se:P.obs[d].s);
        tr.push({type:'scatter',mode:'markers',x:ox,y:od.map(Number),legendgroup:lab,showlegend:false,marker:{size:9,color:cols[k],line:{width:1.5,color:fg},symbol:dash==='dash'?'diamond':'circle'},hovertemplate:`${lab}<br>z = %{y} cm<br>${v==='Se'?'S<sub>e</sub> = %{x:.2f}':'s = %{x:.1f} kPa'}<extra>misura</extra>`}); });
      const L=base(v==='Se'?'saturazione efficace S<sub>e</sub>':'suzione s [kPa]','profondità z [cm]'); L.yaxis.autorange='reversed'; L.legend.font.size=10;
      if(v==='s'){ L.xaxis.type='log'; L.xaxis.dtick=1; L.xaxis.range=[-1,5]; } else L.xaxis.range=[-0.05,1.1];
      PR(`pf-${s}-${v}`,tr,L,cfgP); } });
  // 7. full series in Se
  const days=Object.keys(S2.P_daily), tr=[{type:'bar',x:days,y:days.map(d=>S2.P_daily[d]),name:'pioggia in campo aperto',marker:{color:css('--wet')},yaxis:'y',hovertemplate:'%{x}<br>%{y:.1f} mm/g<extra></extra>'}];
  const doms=[[0.54,0.75],[0.27,0.48],[0,0.21]];
  PAIRS.forEach((pr,j) => SITES.forEach((s,k) => { const R=S2.sites[s], c=css(COL[s]), ya='y'+(j+2);
    tr.push({type:'scatter',mode:'lines',x:T,y:R.obsSe[pr[k]],name:`${s} misurato`,legendgroup:s+'o',showlegend:j===0,line:{color:c,width:1},opacity:.45,yaxis:ya,hovertemplate:`%{x}<br>S<sub>e</sub> = %{y:.2f}<extra>${s} ${pr[k]} cm misurato</extra>`});
    tr.push({type:'scatter',mode:'lines',x:T,y:R.Se[pr[k]],name:`${s} simulato`,legendgroup:s+'s',showlegend:j===0,line:{color:c,width:1.8},yaxis:ya,hovertemplate:`%{x}<br>S<sub>e</sub> = %{y:.2f}<extra>${s} ${pr[k]} cm simulato</extra>`}); }));
  const W=CAL('NV').series, shapes=Object.values(W).map(w=>({type:'rect',xref:'x',yref:'paper',x0:T[w.i0],x1:T[w.i1],y0:0,y1:1,fillcolor:css('--band'),line:{width:0},layer:'below'}));
  const L={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:64,r:16,t:30,b:36},hovermode:'x unified',bargap:0,
    legend:{orientation:'h',x:0,y:1.04,yanchor:'bottom',font:{size:11,color:mu}}, shapes,
    xaxis:{type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y4'}, yaxis:{title:{text:'pioggia [mm/g]',font:{size:11,color:mu}},domain:[0.79,1],gridcolor:gr,tickfont:{color:mu}},
    annotations:[['calib','drying 2025 · calibrazione'],['valid','drying 2026 · validazione']].map(([k,t])=>({xref:'x',yref:'paper',x:T[Math.round((W[k].i0+W[k].i1)/2)],y:1.0,text:t,showarrow:false,font:{size:11,color:mu},yanchor:'bottom'}))};
  PAIRS.forEach((pr,j)=>{ L['yaxis'+(j+2)]={title:{text:`S<sub>e</sub> ${pr[0]}/${pr[1]} cm`,font:{size:11,color:mu}},domain:doms[j],gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}}; });
  PR('tsPlot',tr,L,cfgP);
}
let inited=false;
function activate(){ if(!inited){ inited=true; fill(); } plots(); window.ExpView && window.ExpView.draw(); }
function redraw(){ if(inited && !$('simview').hidden){ plots(); window.ExpView && window.ExpView.draw(); } }
window.ModView = { activate, redraw };
})();
</script>

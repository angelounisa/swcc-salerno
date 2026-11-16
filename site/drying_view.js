<script>
(function(){
'use strict';
const S2 = window.SIM2, A = DATA;   // A = analysis results (drying fits), S2 = model results for both sites
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const $ = id => document.getElementById(id);
const SITES = ['NV','V'], LABEL = {NV:'Senza vegetazione', V:'Vegetata'}, COL = {NV:'--nv', V:'--veg'};
const PAIRS = [['15','15'],['30','35'],['60','60']];
const CMH = 360000; // cm/h per m/s
const fx = (x,k) => (x==null||!isFinite(x)) ? '–' : Number(x).toFixed(k);
const it = x => Math.round(x).toLocaleString('it-IT');
const vg = (s,p) => p.theta_r + (p.theta_s-p.theta_r)/Math.pow(1+Math.pow(p.alpha*s,p.n),1-1/p.n);
const pad = x => String(x).padStart(2,'0');
const t0ms = Date.parse(S2.t0.replace(' ','T')+'Z');
const tstr = i => { const d=new Date(t0ms+i*3.6e6); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`; };
const nH = S2.n_hours, T = Array.from({length:nH},(_,i)=>tstr(i));
const dIt = s => s.slice(0,10).split('-').reverse().join('/');
const GEO = [ // Urciuoli et al., Table 1 and section 2
  {L:'A1', d:'topsoil biogeochimicamente attivo', thick:'5–30 cm', Gs:2.67, n:0.65, gd:9.30, Ks:1.03e-6, phi:38.5},
  {L:'A2', d:'cenere limo-sabbiosa bruna con pomici (79 d.C.)', thick:'65–100 cm', Gs:2.69, n:0.59, gd:10.80, Ks:9.27e-6, phi:38.5},
  {L:'C1', d:'cenere limo-sabbiosa giallastra (pre 79 d.C.), discontinua', thick:'15 cm (medio)', Gs:2.74, n:0.64, gd:9.05, Ks:4.82e-6, phi:36.7}];
const iCal = S2.sites.NV.calib ? S2.sites.NV.calib.iCal : null;

function fill(){
  // --- drying comparison table
  let h = '<thead><tr><th>Profondità</th><th>Parcella</th><th>θr</th><th>θs</th><th>α [1/kPa]</th><th>1/α [kPa]</th><th>n</th><th>θ a 10 kPa</th><th>θ a 100 kPa</th><th>θ a 1000 kPa</th><th>R² punti</th></tr></thead><tbody>';
  PAIRS.forEach(pr => SITES.forEach((s,j) => { const f=A[s].depths[pr[j]].fits.drying, p=f.params, ab=new Set(f.params_at_bound);
    const c=(k,d)=>`<td class="num${ab.has(k)?' bound':''}">${fx(p[k],d)}${ab.has(k)?' <span class="flag">vincolo</span>':''}</td>`;
    h += `<tr><td>${pr[j]} cm</td><td><span class="pill" style="color:var(${COL[s]})">${LABEL[s]}</span></td>${c('theta_r',3)}${c('theta_s',3)}${c('alpha',3)}<td class="num">${fx(1/p.alpha,1)}</td>${c('n',3)}`+
      [10,100,1000].map(x=>`<td class="num">${fx(vg(x,p),3)}</td>`).join('')+`<td class="num">${fx(f.all_points.r2,2)}</td></tr>`; }));
  $('dcTable').innerHTML = h+'</tbody>';
  // --- geotechnical table
  h = '<thead><tr><th>Strato</th><th>Descrizione</th><th>Spessore</th><th>G<sub>s</sub></th><th>n</th><th>γ<sub>d</sub> [kN/m³]</th><th>K<sub>sat</sub> [m/s]</th><th>K<sub>sat</sub> [cm/h]</th><th>φ′ [°]</th></tr></thead><tbody>';
  GEO.forEach(g => h += `<tr><td><b>${g.L}</b></td><td style="white-space:normal;min-width:180px">${g.d}</td><td>${g.thick}</td><td class="num">${g.Gs}</td><td class="num">${g.n}</td><td class="num">${fx(g.gd,2)}</td><td class="num">${g.Ks.toExponential(2)}</td><td class="num">${fx(g.Ks*CMH,2)}</td><td class="num">${g.phi}</td></tr>`);
  $('geoTable').innerHTML = h+'</tbody>';
  // --- zones table
  h = '<thead><tr><th>Parcella</th><th>Profondità [cm]</th><th>Strato</th><th>Curva di ritenzione</th><th>θr</th><th>θs</th><th>α [1/kPa]</th><th>n</th><th>K<sub>s</sub> [cm/h]</th></tr></thead><tbody>';
  SITES.forEach(s => S2.sites[s].model.zones.forEach(z => { const p=S2.sites[s].fits[z.ret];
    h += `<tr><td><span class="pill" style="color:var(${COL[s]})">${s}</span></td><td class="num">${String(z.zTop_cm).replace('.',',')}–${String(z.zBot_cm).replace('.',',')}</td><td>${z.name}</td><td>drying ${z.ret} cm${z.name==='C1'?' <span class="flag">ipotesi</span>':''}</td><td class="num">${fx(p.theta_r,3)}</td><td class="num">${fx(p.theta_s,3)}</td><td class="num">${fx(p.alpha,3)}</td><td class="num">${fx(p.n,3)}</td><td class="num">${fx(z.Ks_cm_h,2)}</td></tr>`; }));
  $('zoneTable').innerHTML = h+'</tbody>';
  // --- BC / parameters table
  const M = {NV:S2.sites.NV.model, V:S2.sites.V.model};
  const rootTxt = m => m.roots.filter(r=>r[1]>0).map(r=>`${r[0]} cm: ${r[1]}`).join(' · ');
  const rows = [
    ['Dominio', m=>`colonna 1D verticale, 0–${m.L_cm} cm (copertura piroclastica ≈ 1,3–1,4 m), Δz = ${m.dz_cm} cm, ${m.L_cm/m.dz_cm+1} nodi`],
    ['Bordo superiore', m=>`flusso atmosferico τ·P − E<sub>p</sub>; se la superficie arriva a h = 0 passa a carico imposto (eccesso = ruscellamento); se scende sotto h = ${(m.hCrit_cm).toLocaleString('it-IT')} cm (≈ ${it(-m.hCrit_cm/10.197)} kPa) passa a carico imposto ed E si riduce`],
    ['Bordo inferiore', m=>`drenaggio libero (gradiente idraulico unitario, q = K(h)) al contatto con la dolomia fratturata`],
    ['Condizione iniziale', m=>`suzione misurata il ${dIt(S2.sites.NV.t_init)} alle tre profondità, interpolata linearmente e costante sopra il sensore superficiale e sotto quello profondo`],
    ['Intercettazione', m=>m.throughfall<1?`τ = ${m.throughfall}: arriva al suolo il ${Math.round(m.throughfall*100)}% della pioggia (throughfall misurato sotto chioma, 15/01–14/02/2026)`:'τ = 1: nessuna chioma arborea; intercettazione della vegetazione erbacea trascurata'],
    ['Evapotraspirazione potenziale', m=>`Oudin (2005) da temperatura media giornaliera del suolo a 15 cm della parcella × fattore ${fx(m.eFactor,2)}; quota traspirata ${fx(m.tFrac,2)}, il resto è evaporazione dal suolo`],
    ['Assorbimento radicale', m=>`Feddes: h₁ = ${m.feddes_cm[0]}, h₂ = ${m.feddes_cm[1]}, h₃ = ${m.feddes_cm[2]}, h₄ = ${m.feddes_cm[3].toLocaleString('it-IT')} cm; densità radicale relativa ${rootTxt(m)} (0 sotto)`],
    ['Conducibilità', m=>`Mualem (l = 0,5) con ingresso d'aria a h<sub>s</sub> = ${m.hs_cm} cm (Vogel et al., 2001); K<sub>s</sub> di laboratorio per strato`],
    ['Schema numerico', m=>`Richards in forma mista, differenze finite implicite, Picard modificato (Celia et al., 1990); Δt adattivo fino a ${m.dtMax_h} h; tolleranza Δθ ${m.tolTheta}`]];
  h = '<thead><tr><th>Voce</th><th>Senza vegetazione</th><th>Vegetata</th></tr></thead><tbody>';
  rows.forEach(([k,f]) => { const a=f(M.NV), b=f(M.V); h += `<tr><td><b>${k}</b></td>`+(a===b?`<td colspan="2" style="white-space:normal">${a}</td>`:`<td style="white-space:normal">${a}</td><td style="white-space:normal">${b}</td>`)+'</tr>'; });
  $('bcTable').innerHTML = h+'</tbody>';
  // --- performance
  h = '<thead><tr><th>Parcella</th><th>Profondità</th><th>RMSE calibrazione (2025)</th><th>RMSE validazione (2026)</th><th>Bias calibrazione</th><th>Bias validazione</th></tr></thead><tbody>';
  SITES.forEach(s => { const R=S2.sites[s]; Object.keys(R.theta).forEach(k => {
    const m=(i0,i1)=>{ let e=0,b=0,n=0; for(let i=i0;i<i1;i++){ const o=R.obs[k][i]; if(o==null) continue; const d=R.theta[k][i]-o; e+=d*d; b+=d; n++; } return [Math.sqrt(e/n), b/n]; };
    const c=m(0,iCal), v=m(iCal,nH);
    h += `<tr><td><span class="pill" style="color:var(${COL[s]})">${LABEL[s]}</span></td><td>${k} cm</td><td class="num">${fx(c[0],3)}</td><td class="num">${fx(v[0],3)}</td><td class="num">${(c[1]>=0?'+':'')+fx(c[1],3)}</td><td class="num">${(v[1]>=0?'+':'')+fx(v[1],3)}</td></tr>`; }); });
  $('perfTable').innerHTML = h+'</tbody>';
  // --- water balance
  const W = s => S2.sites[s].massBalance;
  const wb = [['Pioggia (pluviometro in campo aperto)','rain_mm'],['Intercettata dalla chioma','interception_mm'],['Ruscellamento','runoff_mm'],['Evaporazione dal suolo','evaporation_mm'],['Traspirazione','transpiration_mm'],['Drenaggio alla base (130 cm)','drainage_mm'],['Variazione d\'invaso','dS_mm']];
  h = `<thead><tr><th>Bilancio ${dIt(S2.t0)} → ${dIt(T[nH-1])} [mm]</th><th>Senza vegetazione</th><th>Vegetata</th></tr></thead><tbody>`;
  wb.forEach(([l,k]) => h += `<tr><td>${l}</td><td class="num">${it(W('NV')[k])}</td><td class="num">${it(W('V')[k])}</td></tr>`);
  h += `<tr><td>Errore di chiusura del bilancio</td><td class="num">${fx(W('NV').error_mm,3)}</td><td class="num">${fx(W('V').error_mm,3)}</td></tr>`;
  h += `<tr><td>Parametri calibrati: fattore ETP · quota traspirata</td><td class="num">${fx(S2.sites.NV.model.eFactor,2)} · ${fx(S2.sites.NV.model.tFrac,2)}</td><td class="num">${fx(S2.sites.V.model.eFactor,2)} · ${fx(S2.sites.V.model.tFrac,2)}</td></tr>`;
  $('wbTable').innerHTML = h+'</tbody>';
  // --- notes
  const notes = [
    `<b>Curve di drying di campo, non di laboratorio.</b> Il modello usa le curve ricavate dai sensori. Il loro θ<sub>s</sub> (0,09–0,29) è molto più basso della porosità misurata in laboratorio (0,59–0,65) e del θ<sub>s</sub> delle prove Ku-pF (80–95% della porosità): i sensori TEROS 10 in campo non vedono mai valori vicini alla saturazione. Conviene verificarne la calibrazione prima di usare queste curve per analisi di stabilità.`,
    `<b>Differenze fra le parcelle nei rami di drying.</b> La differenza più grande è a 60 cm: la parcella vegetata trattiene molto meno acqua a ogni suzione (θ<sub>s</sub> 0,19 contro 0,29; a 100 kPa 0,08 contro 0,19). A 15 cm le curve coincidono fra 10 e 100 kPa, ma vicino alla saturazione la parcella vegetata resta molto più asciutta (θ<sub>s</sub> 0,09 contro 0,14) e ha un ingresso d'aria più alto (1/α ≈ 23 kPa contro 0,8 kPa). A 30/35 cm le curve sono simili fino a circa 100 kPa; oltre, la parcella vegetata trattiene un po' più acqua (0,079 contro 0,062 a 1000 kPa).`,
    `<b>Profili.</b> θ è discontinuo ai passaggi fra zone (20 cm, 45 o 47,5 cm) perché ogni zona ha la sua curva di ritenzione; la suzione invece è continua. Nella parcella senza vegetazione l'essiccamento estivo è più forte in superficie: a 15 cm la suzione arriva a circa 1470 kPa, il limite di appassimento di Feddes (h₄), mentre a 60 cm non supera circa 600 kPa (agosto 2025). Nella vegetata l'assorbimento radicale profondo porta 35–60 cm a 1300–1460 kPa già all'inizio di agosto 2025, e la suzione resta più alta fino alla base del profilo.`,
    `<b>Limiti visibili nelle serie.</b> Il modello non secca abbastanza i 60 cm della parcella senza vegetazione d'estate (0,15 simulato contro 0,11 misurato) e, nella parcella vegetata, bagna troppo poco i 60 cm nelle piogge autunnali: con τ costante passa al suolo la stessa frazione anche negli eventi intensi, quando la chioma si satura.`,
    `<b>Zone e strati.</b> Il passaggio A1/A2 è posto a 20 cm (spessore di A1 5–30 cm); C1 è assegnato a 115–130 cm con la curva di ritenzione del sensore a 60 cm, perché non è strumentato. Il modello è verticale: la pendenza di 25–30° del versante non è rappresentata.`,
    `<b>Radici.</b> Le distribuzioni seguono la descrizione del lavoro (massimo a 20 cm nella parcella disboscata con erbacee a radici superficiali, profilo "a cuore" con massimo a 40 cm sotto il leccio), ma i valori numerici sono indicativi: la figura 4 non riporta i dati. Con i pesi secchi delle radici a 20, 40 e 60 cm si possono sostituire.`,
    `<b>Intercettazione costante.</b> τ = 0,49 è il rapporto throughfall/pioggia misurato in un solo mese invernale e molto piovoso; nella realtà dipende da intensità e durata degli eventi. L'acqua intercettata non viene sottratta dall'evapotraspirazione potenziale.`,
    `<b>Ruscellamento nella parcella senza vegetazione.</b> Con K<sub>s</sub> di laboratorio dello strato A1 (1,03·10⁻⁶ m/s ≈ 0,37 cm/h) il modello produce ${it(W('NV').runoff_mm)} mm di ruscellamento, mentre il lavoro lo considera trascurabile. È un segnale che in campo l'infiltrazione superficiale è più rapida (vie preferenziali, macropori) di quella del provino.`,
    `<b>Evapotraspirazione dalla temperatura del suolo.</b> La temperatura dell'aria è misurata in sito dal 17/03/2025 ma non era nei file forniti: usarla al posto di quella del suolo renderebbe più affidabili i fattori calibrati.`,
    `<b>Istanti dei profili.</b> Scelti nelle due stagioni secche: dal 26/04/2025 (dopo l'ultima pioggia primaverile) al 28/08/2025 (prima delle piogge di fine agosto) e dal 01/04/2026 al 30/07/2026 (fine della serie di pioggia); a mezzogiorno.`];
  $('dryNotes').innerHTML = notes.map(x=>'<li>'+x+'</li>').join('');
  $('colsvg').innerHTML = columnSVG();
}

function columnSVG(){
  // two soil columns drawn to scale (3 px/cm), with zones, sensors, roots and boundary conditions
  const sc = 3, top = 92, colW = 120, gap = 210, x0 = 92, Lc = 130;
  const W = x0 + 2*colW + gap + 150, H = top + Lc*sc + 70;
  const y = z => top + z*sc;
  let g = '';
  SITES.forEach((s,k) => {
    const M = S2.sites[s].model, x = x0 + k*(colW+gap);
    g += `<text x="${x+colW/2}" y="18" text-anchor="middle" font-weight="600" style="fill:var(${COL[s]})">${LABEL[s]}</text>`;
    // top BC arrows
    g += `<g style="stroke:var(--wet);fill:var(--wet)"><line x1="${x+20}" y1="30" x2="${x+20}" y2="${top-6}" stroke-width="1.5"/><path d="M${x+15},${top-12} l5,7 l5,-7z"/></g>`;
    g += `<text x="${x+28}" y="42" style="fill:var(--muted)" font-size="11">${M.throughfall<1?'τ·P (τ = '+M.throughfall+')':'P'}</text>`;
    g += `<g style="stroke:var(--dry);fill:var(--dry)"><line x1="${x+colW-20}" y1="${top-6}" x2="${x+colW-20}" y2="30" stroke-width="1.5"/><path d="M${x+colW-25},36 l5,-7 l5,7z"/></g>`;
    g += `<text x="${x+colW-28}" y="58" text-anchor="end" style="fill:var(--muted)" font-size="11">E<tspan baseline-shift="sub" font-size="8">p</tspan></text>`;
    if (k===1) g += `<g style="stroke:var(--veg)" stroke-width="1.5" fill="none"><path d="M${x+colW/2-14},${top-8} q-6,-22 4,-40 M${x+colW/2+6},${top-8} q8,-24 -2,-42"/></g>`;
    else g += `<g style="stroke:var(--veg)" stroke-width="1.2" fill="none"><path d="M${x+colW/2-8},${top-2} l-4,-12 M${x+colW/2},${top-2} l0,-14 M${x+colW/2+8},${top-2} l4,-12"/></g>`;
    // zones
    M.zones.forEach(z => {
      const fillv = z.name==='A1'?'--soilA1':z.name==='A2'?'--soilA2':'--soilC1';
      g += `<rect x="${x}" y="${y(z.zTop_cm)}" width="${colW}" height="${(z.zBot_cm-z.zTop_cm)*sc}" style="fill:var(${fillv});stroke:var(--line)"/>`;
      g += `<text x="${x+6}" y="${y(z.zTop_cm)+14}" font-size="11" style="fill:var(--fg)">${z.name} · θ(h) ${z.ret} cm</text>`;
      g += `<text x="${x+6}" y="${y(z.zTop_cm)+27}" font-size="10" style="fill:var(--muted)">K<tspan baseline-shift="sub" font-size="8">s</tspan> ${fx(z.Ks_cm_h,2)} cm/h</text>`;
    });
    // bedrock
    g += `<rect x="${x}" y="${y(Lc)}" width="${colW}" height="18" style="fill:var(--rock)"/><text x="${x+colW/2}" y="${y(Lc)+13}" text-anchor="middle" font-size="10" style="fill:var(--fg)">dolomia fratturata</text>`;
    g += `<text x="${x+colW/2}" y="${y(Lc)+34}" text-anchor="middle" font-size="11" style="fill:var(--muted)">drenaggio libero, ∂H/∂z = 1</text>`;
    // sensors
    Object.keys(S2.sites[s].theta).forEach(d => { g += `<circle cx="${x+colW-14}" cy="${y(+d)}" r="5" style="fill:var(--panel);stroke:var(--fg)" stroke-width="1.5"/><text x="${x+colW+8}" y="${y(+d)+4}" font-size="11" style="fill:var(--fg)">${d} cm</text>`; });
    // roots profile (right of the column)
    const rx = x + colW + 52, rw = 70, R = M.roots, mx = Math.max(...R.map(r=>r[1]));
    let path = `M${rx},${y(R[0][0])}`; R.forEach(r => path += ` L${rx + r[1]/mx*rw},${y(r[0])}`); path += ` L${rx},${y(R[R.length-1][0])} Z`;
    g += `<path d="${path}" style="fill:var(--veg);opacity:.25;stroke:var(--veg)"/><line x1="${rx}" y1="${y(0)}" x2="${rx}" y2="${y(Lc)}" style="stroke:var(--line)"/>`;
    g += `<text x="${rx}" y="${top-6}" font-size="10" style="fill:var(--muted)">radici (relativa)</text>`;
  });
  // depth axis
  for (let z=0; z<=Lc; z+=10) g += `<line x1="${x0-6}" y1="${y(z)}" x2="${x0}" y2="${y(z)}" style="stroke:var(--muted)"/>`+(z%20===0||z===Lc?`<text x="${x0-10}" y="${y(z)+4}" text-anchor="end" font-size="10" style="fill:var(--muted)">${z}</text>`:'');
  g += `<text x="${x0-44}" y="${y(Lc/2)}" font-size="11" style="fill:var(--muted)" transform="rotate(-90 ${x0-44} ${y(Lc/2)})" text-anchor="middle">profondità z [cm]</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Schema delle due colonne di terreno modellate" style="font-family:var(--f-body)">${g}</svg>`;
}

const SEASON_COL = { '2025':['#f0c27e','#e09a4a','#c4722c','#93501b','#5e3310'], '2026':['#a7cdea','#6ea8d8','#3f80bf','#245d9b','#103a69'] };
function instColors(M){ const c={'2025':0,'2026':0}; return M.profileInstants.map(s=>{ const y=s.slice(0,4); return SEASON_COL[y][c[y]++]; }); }

function plots(){
  const fg=css('--fg'), mu=css('--muted'), gr=css('--grid'), ln=css('--line');
  const base = (xt,yt) => ({ paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{family:css('--f-body'),size:12,color:fg},
    margin:{l:56,r:12,t:30,b:44}, hovermode:'closest', showlegend:true, legend:{orientation:'h',x:0,y:1.02,yanchor:'bottom',font:{size:11,color:mu}},
    xaxis:{title:{text:xt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}},
    yaxis:{title:{text:yt,font:{color:mu}},gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}} });
  const cfgP={displaylogo:false,responsive:true,modeBarButtonsToRemove:['lasso2d','select2d']};
  // 1. drying curves
  PAIRS.forEach((pr,j) => {
    const tr=[];
    SITES.forEach((s,k) => { const R=A[s].depths[pr[k]], F=R.fits.drying, c=css(COL[s]);
      tr.push({type:'scatter',mode:'markers',x:F.bins.s,y:F.bins.theta,name:`${s} ${pr[k]} cm mediane`,showlegend:false,marker:{size:6,color:c,opacity:.5},hovertemplate:`${LABEL[s]} ${pr[k]} cm<br>s = %{x:.1f} kPa<br>θ = %{y:.3f}<extra></extra>`});
      tr.push({type:'scatter',mode:'lines',x:R.curve_s,y:F.curve_theta,name:`${LABEL[s]} · ${pr[k]} cm`,line:{color:c,width:2.5},hovertemplate:`VG ${LABEL[s]}<br>s = %{x:.1f} kPa<br>θ = %{y:.3f}<extra></extra>`}); });
    const L=base('suzione s [kPa]','θ [m³/m³]'); L.xaxis.type='log'; L.xaxis.dtick=1; L.xaxis.range=[-1.1,Math.log10(4000)];
    Plotly.react('dc-'+j,tr,L,cfgP);
  });
  // 4. profiles
  SITES.forEach(s => {
    const R=S2.sites[s], M=R.model, cols=instColors(M), z=R.z_cm;
    for (const v of ['th','s']) {
      const tr=[];
      M.profileHours.forEach((hr,k) => { const P=R.profiles[hr], lab=dIt(M.profileInstants[k]), dash=M.profileInstants[k].startsWith('2026')?'dash':'solid';
        const x = v==='th'?P.theta:P.s_kPa.map(q=>Math.max(q,0.1));
        tr.push({type:'scatter',mode:'lines',x,y:z,name:lab,legendgroup:lab,line:{color:cols[k],width:2,dash},hovertemplate:`${lab}<br>z = %{y} cm<br>${v==='th'?'θ = %{x:.3f}':'s = %{x:.1f} kPa'}<extra>simulato</extra>`});
        const od=Object.keys(P.obs), ox=od.map(d=>v==='th'?P.obs[d].theta:P.obs[d].s);
        tr.push({type:'scatter',mode:'markers',x:ox,y:od.map(Number),name:lab+' misure',legendgroup:lab,showlegend:false,marker:{size:9,color:cols[k],line:{width:1.5,color:fg},symbol:dash==='dash'?'diamond':'circle'},hovertemplate:`${lab}<br>z = %{y} cm<br>${v==='th'?'θ = %{x:.3f}':'s = %{x:.1f} kPa'}<extra>misura</extra>`});
      });
      const L=base(v==='th'?'θ [m³/m³]':'suzione s [kPa]','profondità z [cm]'); L.yaxis.autorange='reversed'; L.legend.font.size=10;
      if(v==='s'){ L.xaxis.type='log'; L.xaxis.dtick=1; L.xaxis.range=[-1,5]; } else L.xaxis.range=[0,0.36];
      Plotly.react(`pf-${s}-${v}`,tr,L,cfgP);
    }
  });
  // 5. time series
  const days=Object.keys(S2.P_daily), tr=[{type:'bar',x:days,y:days.map(d=>S2.P_daily[d]),name:'pioggia',marker:{color:css('--wet')},yaxis:'y',hovertemplate:'%{x}<br>%{y:.1f} mm/g<extra></extra>'}];
  const doms=[[0.54,0.75],[0.27,0.48],[0,0.21]];
  PAIRS.forEach((pr,j) => SITES.forEach((s,k) => { const R=S2.sites[s], c=css(COL[s]), ya='y'+(j+2);
    tr.push({type:'scatter',mode:'lines',x:T,y:R.obs[pr[k]],name:`${s} misurato`,legendgroup:s+'o',showlegend:j===0,line:{color:c,width:1},opacity:.45,yaxis:ya,hovertemplate:`%{x}<br>θ = %{y:.3f}<extra>${s} ${pr[k]} cm misurato</extra>`});
    tr.push({type:'scatter',mode:'lines',x:T,y:R.theta[pr[k]],name:`${s} simulato`,legendgroup:s+'s',showlegend:j===0,line:{color:c,width:1.8},yaxis:ya,hovertemplate:`%{x}<br>θ = %{y:.3f}<extra>${s} ${pr[k]} cm simulato</extra>`}); }));
  const M=S2.sites.NV.model, cols=instColors(M);
  const shapes=[{type:'rect',xref:'x',yref:'paper',x0:T[iCal],x1:T[nH-1],y0:0,y1:1,fillcolor:css('--band'),line:{width:0},layer:'below'}]
    .concat(M.profileHours.map((hr,k)=>({type:'line',xref:'x',yref:'paper',x0:T[hr],x1:T[hr],y0:0,y1:0.75,line:{color:cols[k],width:1.5,dash:'dot'}})));
  const L={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:css('--f-body'),size:12,color:fg},margin:{l:64,r:16,t:30,b:36},hovermode:'x unified',bargap:0,
    legend:{orientation:'h',x:0,y:1.04,yanchor:'bottom',font:{size:11,color:mu}}, shapes,
    xaxis:{type:'date',gridcolor:gr,linecolor:ln,tickfont:{color:mu},anchor:'y4'}, yaxis:{title:{text:'pioggia [mm/g]',font:{size:11,color:mu}},domain:[0.79,1],gridcolor:gr,tickfont:{color:mu}},
    annotations:[{xref:'x',yref:'paper',x:T[Math.round(iCal/2)],y:1.0,text:'calibrazione',showarrow:false,font:{size:11,color:mu},yanchor:'bottom'},{xref:'x',yref:'paper',x:T[Math.round((iCal+nH)/2)],y:1.0,text:'validazione',showarrow:false,font:{size:11,color:mu},yanchor:'bottom'}]};
  PAIRS.forEach((pr,j)=>{ L['yaxis'+(j+2)]={title:{text:`θ ${pr[0]}/${pr[1]} cm`,font:{size:11,color:mu}},domain:doms[j],gridcolor:gr,linecolor:ln,zeroline:false,tickfont:{color:mu}}; });
  Plotly.react('tsPlot',tr,L,cfgP);
}
let inited=false;
function activate(){ if(!inited){ inited=true; fill(); } plots(); }
function redraw(){ if(inited && !$('simview').hidden) plots(); }
window.SimView = { activate, redraw };
})();
</script>

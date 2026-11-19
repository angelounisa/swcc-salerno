// Runs sim/solver.js on the same cases as ref_solver.py and compares the head profiles (at 1 cm nodes).
const fs=require('fs'), S=require('../sim/solver.js');
const R=JSON.parse(fs.readFileSync('../sim/sim2_results.json')), FITS=JSON.parse(fs.readFileSync('../sim/fits_main.json')).NV, REF=JSON.parse(fs.readFileSync('out_ref.json'));
const M0=R.sites.NV.model, out={}, summary=[];   // the tests use the model grid (dz) and twice that
function run(c, dz){
  const M=JSON.parse(JSON.stringify(M0)); M.dz_cm=dz; M.eFactor=1; M.profileHours=c.hours.map(h=>h-1); M.outDepths_cm=[15]; M.tolTheta=1e-6;
  const nH=Math.max(...c.hours); let f, cfg;
  if(c.name==='T1'){ M.tFrac=1; f={P_mm:new Array(nH).fill(0),PE_mm:new Array(nH).fill(0.2)}; cfg=S.buildConfig(M,FITS,c.s0); }
  if(c.name==='T2'){ M.tFrac=0; f={P_mm:Array.from({length:nH},(_,i)=>i<24?2:0),PE_mm:new Array(nH).fill(0)}; cfg=S.buildConfig(M,FITS,{'15':1,'30':1,'60':1}); cfg.h0_cm=cfg.h0_cm.map(()=>c.h0); }
  if(c.name==='T3'){ M.tFrac=0; f={P_mm:new Array(nH).fill(0),PE_mm:new Array(nH).fill(100)}; cfg=S.buildConfig(M,FITS,{'15':1,'30':1,'60':1}); cfg.h0_cm=cfg.h0_cm.map(()=>c.h0); }
  const o=S.run(cfg,f), step=Math.round(1/dz); const prof={};
  for(const h of c.hours) prof[h]=o.profiles[h-1].h_cm.filter((_,i)=>i%step===0);
  return {prof, mb:o.massBalance};
}
for (const [name,c0] of Object.entries(REF.cases)) { const c=Object.assign({name},c0); out[name]={};
  for (const dz of [M0.dz_cm*2, M0.dz_cm]) { const r=run(c,dz); out[name][dz]=r.prof; const hl=String(Math.max(...c.hours)); let worst=0;
    console.log(name,'dz',dz,'end: net surface flux mm  sim',r.mb.netSurface_mm.toFixed(2),'ref',c.cum_surface_in_mm[hl].toFixed(2),'| drainage mm  sim',r.mb.drainage_mm.toFixed(2),'ref',c.cum_drain_mm[hl].toFixed(2));
    for (const h of c.hours) { const ref=c.profiles[h], sim=r.prof[h]; let mx=0, at=0, rel=0;
      for(let i=0;i<ref.length;i++){ const d=Math.abs(Math.log10(-Math.min(sim[i],-1e-3))-Math.log10(-Math.min(ref[i],-1e-3))); if(d>mx){mx=d;at=i;} }
      worst=Math.max(worst,mx);
      console.log(name,'dz',dz,'t',h,'h: max |dlog10(-h)| =',mx.toFixed(4),'at z',at,'cm (sim',sim[at].toFixed(1),'ref',ref[at].toFixed(1),')  mass err mm',r.mb.error_mm.toFixed(4)); }
    summary.push({case:name, desc:c.desc, dz, max_dlog10_h:worst, surface_sim_mm:r.mb.netSurface_mm, surface_ref_mm:c.cum_surface_in_mm[hl], drain_sim_mm:r.mb.drainage_mm, drain_ref_mm:c.cum_drain_mm[hl], mass_error_mm:r.mb.error_mm}); } }
fs.writeFileSync('out_cmp.json',JSON.stringify({ref:REF,sim:out,summary,dz_model:M0.dz_cm}));

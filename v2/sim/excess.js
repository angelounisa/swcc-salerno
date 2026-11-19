// How much of the water loss in the 2025 drying window is attributed to evapotranspiration only because the
// calibrated PET factor is > 1, and how it compares with the downslope flow through the column.
const fs=require('fs'), S=require('./solver.js'); const R=JSON.parse(fs.readFileSync('sim2_results.json')), FITS=JSON.parse(fs.readFileSync('fits_main.json'));
const out={};
for (const s of ['NV','V']) { const F=JSON.parse(fs.readFileSync(`forcing_${s}.json`)), M0=R.sites[s].model, w=R.sites[s].calib.series.calib, keys=Object.keys(F.obs);
  const s0={}; for(const k of keys) s0[k]=F.obs_s[k][w.i0]; const f={P_mm:F.P_mm.slice(w.i0+1,w.i1+1),PE_mm:F.PE_mm.slice(w.i0+1,w.i1+1)};
  const run=eF=>{ const M=JSON.parse(JSON.stringify(M0)); M.eFactor=eF; M.profileHours=[]; return S.run(S.buildConfig(M,FITS[s],s0),f).massBalance; };
  const a=run(M0.eFactor), b=run(1.0), et=m=>m.transpiration_mm+m.evaporation_mm;
  // observed storage change of the instrumented column 0-75 cm (sensor layers as in infil_events.py)
  const lay=s==='NV'?{'15':22.5,'30':22.5,'60':30}:{'15':25,'35':22.5,'60':27.5}; let dSobs=0; for(const k of keys) dSobs+=(F.obs[k][w.i1]-F.obs[k][w.i0])*lay[k]*10;
  out[s]={eFactor_cal:M0.eFactor, ET_cal_mm:et(a), ET_factor1_mm:et(b), excess_mm:et(a)-et(b), dS_model_cal_mm:a.dS_mm, dS_model_factor1_mm:b.dS_mm, dS_observed_0_75cm_mm:dSobs,
    drainage_cal_mm:a.drainage_mm, lateral_m3_per_m:a.lateral_throughflow_m3_per_m, rain_mm:a.rain_mm, PE_window_mm:f.PE_mm.reduce((x,y)=>x+y,0)};
  out[s].length_for_excess_m = out[s].lateral_m3_per_m*1000/out[s].excess_mm;
  console.log(s, JSON.stringify(Object.fromEntries(Object.entries(out[s]).map(([k,v])=>[k,+v.toFixed(3)]))));
}
fs.writeFileSync('excess.json', JSON.stringify(out,null,1));

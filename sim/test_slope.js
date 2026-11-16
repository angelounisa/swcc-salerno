// Checks of the infinite-slope formulation.
// (a) slope 0 must reproduce the vertical-column results obtained before the change (baseline_vertical.json);
// (b) steady infiltration at a constant rate r: the profile must tend to uniform head with K(h) = r for ANY slope
//     (unit gradient normal to the slope gives q = K per unit horizontal area), and the mass balance must close.
const fs=require('fs'), S=require('./solver.js'), assert=require('assert');
const FITS=JSON.parse(fs.readFileSync('fits_main.json')), B=JSON.parse(fs.readFileSync('baseline_vertical.json'));
// (a)
{ const s='NV', F=JSON.parse(fs.readFileSync(`forcing_${s}.json`)), M=JSON.parse(fs.readFileSync(`model_${s}.json`));
  assert.strictEqual(M.slope_deg,0); M.eFactor=B.params[s].eFactor; M.profileHours=[];
  M.zones.forEach(z=>{ z.Ks_cm_h*=Math.pow(10,B.params[s].log10_kmult); if(z.name==='A1') z.Kmac_cm_h=B.kmacChosen.Kmac_A1_cm_h; });
  const o=S.run(S.buildConfig(M,FITS[s],F.s0_kPa),F), mb=B.sites[s].massBalance;
  for (const k of ['drainage_mm','runoff_mm','transpiration_mm','evaporation_mm','dS_mm']) { const d=Math.abs(o.massBalance[k]-mb[k]); console.log('(a)',k,o.massBalance[k].toFixed(3),mb[k].toFixed(3)); assert(d<1e-6,'slope 0 differs from the vertical baseline: '+k); } }
// (b)
const r=0.01, nH=24*400;   // cm/h, 400 days
const f={P_mm:new Array(nH).fill(r*10), PE_mm:new Array(nH).fill(0)}, fit={theta_r:0.08,theta_s:0.30,alpha:0.07,n:1.48};
for (const beta of [0,32]) {
  const M={L_cm:100,dz_cm:1,hCrit_cm:-100000,Ss_per_cm:1e-6,hs_cm:-2,dtMin_h:1e-7,dtMax_h:1,maxIter:25,tolTheta:1e-6,tolHsat_cm:0.1,itGrow:4,itShrink:8,outDepths_cm:[50],
    eFactor:1,throughfall:1,tFrac:0,roots:[[0,0],[100,0]],feddes_cm:[0,-1,-1000,-15000],profileHours:[nH-1],slope_deg:beta,
    zones:[{name:'X',zTop_cm:0,zBot_cm:100,ret:'a',Ks_cm_h:0.2,Kmac_cm_h:0,hmac_cm:5}]};
  const o=S.run(S.buildConfig(M,{a:fit},{'50':30}),f), h=o.profiles[nH-1].h_cm;
  const m=1-1/fit.n, a=fit.alpha/S.CM_PER_KPA, SF=hh=>{const an=Math.pow(a*-hh,fit.n);return [Math.pow(1+an,-m),1-Math.pow(an/(1+an),m)];};
  const K=hh=>{const [s1,f1]=SF(hh),[s2,f2]=SF(-2);return 0.2*Math.sqrt(s1/s2)*(f1/f2)**2;};
  const Kmid=K(h[50]), spread=Math.max(...h.slice(5,95))-Math.min(...h.slice(5,95));
  console.log('(b) beta',beta,'h(50cm)',h[50].toFixed(2),'K(h)/r',(Kmid/r).toFixed(4),'head spread 5-95 cm',spread.toFixed(3),'mass error mm',o.massBalance.error_mm.toFixed(4),'lateral m3/m',o.massBalance.lateral_throughflow_m3_per_m.toFixed(4));
  assert(Math.abs(Kmid/r-1)<0.01,'steady state K(h) != r'); assert(spread<0.5,'head not uniform'); assert(Math.abs(o.massBalance.error_mm)<0.5,'mass balance');
  if (beta>0) { const exp=r*Math.sin(beta*Math.PI/180)*Math.cos(beta*Math.PI/180)*100; console.log('    steady lateral flux cm2/h per cm:',(o.lateral_cm2_per_cm[nH-1]).toFixed(5),'expected r sin cos L =',exp.toFixed(5)); assert(Math.abs(o.lateral_cm2_per_cm[nH-1]/exp-1)<0.02); }
}
console.log('all checks passed');

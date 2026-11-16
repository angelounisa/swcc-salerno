// node run3.js SITE [eFactor kmult]  -> one full-period run (model_SITE.json, forcing_SITE.json, fits_main.json)
const fs=require('fs'), S=require('./solver.js'); const site=process.argv[2];
const F=JSON.parse(fs.readFileSync(`forcing_${site}.json`)), M=JSON.parse(fs.readFileSync(`model_${site}.json`)), fits=JSON.parse(fs.readFileSync('fits_main.json'))[site];
if(process.argv[3]){ M.eFactor=+process.argv[3]; const k=+process.argv[4]; M.zones.forEach(z=>{ z.Ks_cm_h*=k; }); }
const t=Date.now(), o=S.run(S.buildConfig(M,fits,F.s0_kPa),F);
const rm={}; for(const k of Object.keys(F.obs)){ let e=0,n=0; const p=fits[k]; F.obs[k].forEach((v,i)=>{ if(v!=null){ e+=((o.theta[+k][i]-v)/(p.theta_s-p.theta_r))**2; n++; } }); rm[k]=+Math.sqrt(e/n).toFixed(3); }
console.log(site, Date.now()-t,'ms steps',o.stats.steps,'RMSE Se',JSON.stringify(rm), JSON.stringify(Object.fromEntries(Object.entries(o.massBalance).map(([k,v])=>[k,+v.toFixed(2)]))));

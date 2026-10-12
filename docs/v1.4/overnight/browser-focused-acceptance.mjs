import assert from 'node:assert/strict'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const root=process.env.GITHUB_WORKSPACE,out=process.env.RUNNER_TEMP+'/dual-evidence',origin='https://localhost:3443'
if(process.env.GITHUB_ACTIONS!=='true'||process.env.APP_URL!==origin)throw Error('Disposable browser boundary required')
await mkdir(out,{recursive:true})
const fixture=JSON.parse(await readFile(process.env.RUNNER_TEMP+'/dual-accounts.json','utf8'))
const req=createRequire(root+'/packages/forms-pdf/package.json')
const {default:puppeteer}=await import(req.resolve('puppeteer-core'))
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:1000}})
const report={sourceCommit:'563fb0e9b79a838a5f394abaffb2f7dc743fc571',sourceTree:'324c50a60e2cb0639ba920488a150c6531968374',scope:'Additional property reassignment and real menu navigation; no repeat release gates',checks:[],screenshots:[],runtimeErrors:[],gaps:[]}
const pages={},pause=ms=>new Promise(r=>setTimeout(r,ms))
async function visible(h){return h.evaluate(e=>!!(e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'))}
async function clickText(p,selector,label){for(const h of await p.$$(selector)){if(await visible(h)&&(await h.evaluate(e=>e.textContent.trim()))===label){await h.click();return}}throw Error('Visible control missing: '+label)}
async function settled(p){
 await p.waitForFunction(()=>[...document.querySelectorAll('div[aria-hidden="true"]')].filter(e=>e.classList.contains('z-[100]')).every(e=>getComputedStyle(e).opacity==='0'),{timeout:20000})
 await pause(1400)
 const tour=await p.$('button[aria-label="Close tour"]');if(tour&&await visible(tour)){await tour.click();await p.waitForNetworkIdle({idleTime:300,timeout:5000}).catch(()=>{})}
}
async function shot(p,name){await settled(p);await p.screenshot({path:out+'/'+name+'.png',fullPage:true});report.screenshots.push(name+'.png')}
async function go(p,path){const r=await p.goto(origin+path,{waitUntil:'networkidle2'});assert(r&&r.status()<500,'Server error');assert(!new URL(p.url()).pathname.startsWith('/login'),'Unauthenticated redirect');await settled(p);return p.$eval('body',e=>e.innerText)}
async function record(name,fn){try{const detail=await fn();report.checks.push({name,status:'PASS',detail});console.log('BROWSER_PASS '+name)}catch(e){report.checks.push({name,status:'FAIL',error:String(e.message).slice(0,800)});console.log('BROWSER_FAIL '+name+': '+String(e.message).slice(0,400));for(const [role,p]of Object.entries(pages)){try{await p.screenshot({path:out+'/failure-'+report.checks.length+'-'+role+'.png',fullPage:true})}catch{}}}}
try{
 for(const role of ['platform','cluster','restricted']){
  await record('Focused fixture authentication '+role,async()=>{
   const a=fixture.accounts[role],ctx=await browser.createBrowserContext(),p=await ctx.newPage();pages[role]=p
   p.on('pageerror',e=>report.runtimeErrors.push({role,message:String(e.message).slice(0,500)}))
   await p.goto(origin+'/login',{waitUntil:'networkidle2'});await settled(p);await p.type('#email',a.email);await p.type('#password',a.password)
   const wait=p.waitForResponse(r=>r.url().includes('/api/auth/sign-in/email')&&r.request().method()==='POST');await p.click('button[type="submit"]');const response=await wait;assert(response.ok(),'Authentication HTTP '+response.status())
   await p.waitForFunction(()=>!location.pathname.startsWith('/login'),{timeout:30000});await pause(12000)
  })
 }
 for(const width of [390])for(const [label,path]of [['People','/people'],['Approvals','/approvals']]){
  await record((width===390?'Mobile':'Desktop')+' actual menu navigation '+label,async()=>{
   const p=pages.cluster;await p.setViewport({width,height:width===390?844:1000,isMobile:width===390,hasTouch:width===390})
   await go(p,'/dashboard')
   if(width===390){const open=await p.$('button[aria-label="Open navigation"]');assert(open,'Mobile navigation toggle missing');await open.click();await p.waitForSelector('[role="dialog"] nav',{visible:true});await pause(400)}
   const navRoot=width===390?'[role="dialog"] nav':'aside nav'
   let found=false
   for(const a of await p.$(navRoot+' a[href="'+path+'"]')){if(await visible(a)){await a.click();found=true;break}}
   if(!found){await clickText(p,navRoot+' button',label);await pause(200);for(const a of await p.$(navRoot+' a[href="'+path+'"]')){if(await visible(a)){await a.click();found=true;break}}}
   assert(found,'Menu destination unavailable');await p.waitForFunction(path=>location.pathname===path,{timeout:15000},path);await settled(p)
   const body=await p.$eval('body',e=>e.innerText);assert(body.includes(label));await shot(p,(width===390?'mobile':'desktop')+'-settled-'+label.toLowerCase())
   const overflow=await p.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert(overflow.document<=overflow.viewport+2,'Horizontal overflow');return overflow
  })
 }
 await record('Property reassignment, live-session isolation and restoration through UI',async()=>{
  const p=pages.platform,q=pages.restricted,target=fixture.accounts.restricted,off=fixture.properties[0],tls=fixture.properties[1]
  const foreign=fixture.people.find(x=>x.key==='fenchurch-manager'),own=fixture.people.find(x=>x.key==='lincoln-manager')
  async function assertScope(allowed,denied){const a=await go(q,'/people/'+allowed.personId);assert(a.includes(allowed.firstName)&&a.includes(allowed.lastName),'Assigned property profile missing');const d=await go(q,'/people/'+denied.personId);assert(!d.includes(denied.email)&&!d.includes(denied.firstName+' '+denied.lastName),'Unassigned property profile exposed');assert(/not found|unavailable|404/i.test(d),'Missing explicit denial')}
  async function reassign(from,to){
   await go(p,'/admin/users/'+target.tenantUserId+'?tab=roles')
   const details=await p.$$('details');assert.equal(details.length,1,'Unexpected role count in restricted fixture')
   await (await details[0].$('summary')).click()
   const form=await details[0].$('form'),scope=JSON.parse(await form.$eval('input[name="scope"]',e=>e.value))
   assert.deepEqual(scope,{type:'properties',propertyIds:[from.id]},'Unexpected existing authority')
   let remove
   for(const h of await form.$$('button[aria-label]'))if((await h.evaluate(e=>e.getAttribute('aria-label'))).includes(from.name)){remove=h;break}
   assert(remove,'Current property chip missing');await remove.click()
   const pickers=await form.$('button[aria-haspopup="listbox"]');assert.equal(pickers.length,2,'Expected scope-type and property pickers');await pickers[1].click();await p.waitForSelector('button[role="option"]',{visible:true});await clickText(p,'button[role="option"]',to.name)
   assert.deepEqual(JSON.parse(await form.$eval('input[name="scope"]',e=>e.value)),{type:'properties',propertyIds:[to.id]})
   await clickText(p,'details[open] button','Save access scope');await p.waitForNetworkIdle({idleTime:500,timeout:15000})
   await go(p,'/admin/users/'+target.tenantUserId+'?tab=roles')
   assert.deepEqual(JSON.parse(await p.$eval('details input[name="scope"]',e=>e.value)),{type:'properties',propertyIds:[to.id]},'Assignment not persisted')
  }
  await assertScope(own,foreign);await reassign(tls,off);await assertScope(foreign,own);await shot(q,'reassigned-property-isolation')
  await reassign(off,tls);await assertScope(own,foreign);await shot(p,'property-assignment-restored')
  const audit=await go(p,'/admin/users/'+target.tenantUserId+'?tab=activity');assert(audit.includes('access scope'),'Assignment audit missing');await shot(p,'property-assignment-audit')
  return {from:tls.name,to:off.name,restored:true,sameAuthenticatedRestrictedSession:true}
 })
 report.gaps.push('People original references located; pixel comparison NOT VERIFIED because available cloud reader returned text/asset pointers. Screenshots require visual review.')
}catch(e){report.gaps.push(String(e.message))}
finally{await browser.close();report.status=report.checks.some(x=>x.status==='FAIL')?'ACCEPTANCE_GAPS':'FOCUSED_CHECKS_PASS';await writeFile(out+'/browser-acceptance.json',JSON.stringify(report,null,2));console.log('BROWSER_ACCEPTANCE_JSON='+JSON.stringify(report))}
if(report.checks.some(x=>x.status==='FAIL'))process.exitCode=1

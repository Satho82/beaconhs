import assert from 'node:assert/strict'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const root=process.env.GITHUB_WORKSPACE, out=process.env.RUNNER_TEMP+'/dual-evidence'
if(process.env.GITHUB_ACTIONS!=='true'||process.env.APP_URL!=='https://localhost:3443')throw Error('Disposable browser boundary required')
await mkdir(out,{recursive:true})
const fixture=JSON.parse(await readFile(process.env.RUNNER_TEMP+'/dual-accounts.json','utf8'))
const req=createRequire(root+'/packages/forms-pdf/package.json')
const {default:puppeteer}=await import(req.resolve('puppeteer-core'))
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:1000}})
const report={sourceCommit:'563fb0e9b79a838a5f394abaffb2f7dc743fc571',sourceTree:'324c50a60e2cb0639ba920488a150c6531968374',runtime:'production Next standalone; disposable hosted CI',checks:[],screenshots:[],gaps:[]}
const pages={}
async function record(name,fn){try{const detail=await fn();report.checks.push({name,status:'PASS',detail});console.log('BROWSER_PASS '+name)}catch(e){report.checks.push({name,status:'FAIL',error:String(e.message).slice(0,1000)});console.log('BROWSER_FAIL '+name+': '+String(e.message).slice(0,400))}}
async function shot(p,name){const path=out+'/'+name+'.png';await p.screenshot({path,fullPage:true});report.screenshots.push(name+'.png')}
async function go(p,path){const r=await p.goto('https://localhost:3443'+path,{waitUntil:'networkidle2',timeout:60000});assert(r&&r.status()<500,'Server error at '+path);assert(!new URL(p.url()).pathname.startsWith('/login'),'Unauthenticated redirect');const text=await p.$eval('body',x=>x.innerText);assert(!/Application error:|Unable to load approvals/i.test(text),'Application error at '+path);return text}
async function type(p,name,value){const q='[name="'+name+'"]';await p.waitForSelector(q);await p.$eval(q,x=>{x.value=''});await p.type(q,String(value))}
async function select(p,name,value){await p.select('select[name="'+name+'"]',String(value))}
async function button(p,text){const h=await p.$$('button');for(const b of h){if((await b.evaluate(x=>x.textContent.trim()))===text){await b.click();return}}throw Error('Button missing: '+text)}
async function submit(p,label){const response=p.waitForResponse(r=>r.url().endsWith('/api/approvals')&&r.request().method()==='POST',{timeout:30000});await button(p,label);const r=await response;const j=await r.json();assert(r.ok(),j.error||'Request failed');assert(j.id,'Missing returned identity');await p.waitForNetworkIdle({idleTime:500,timeout:15000}).catch(()=>{});return j.id}
async function activity(p,id,kind){await go(p,'/approvals/requests/'+id);await select(p,'kind',kind);const area=await p.$('select[name="kind"]');const form=await area.evaluateHandle(x=>x.closest('form'));const body=await form.$('textarea[name="body"]');await body.type('Synthetic browser acceptance '+kind);await submit(p,'Save Activity')}
async function createRequest(title,amount='125.01',expectDeny=false){
 const p=pages.requester;await go(p,'/approvals/new');await select(p,'workflowId',workflowId)
 for(const [k,v] of Object.entries({title,category:'Maintenance',amount,supplier:'Synthetic supplier',description:'Disposable authenticated acceptance only'}))await type(p,k,v)
 await select(p,'currency','GBP');await (await p.$('input[type="file"]')).uploadFile(out+'/synthetic.pdf')
 if(expectDeny){const response=p.waitForResponse(r=>r.url().endsWith('/api/approvals')&&r.request().method()==='POST');await button(p,'Submit Request');const r=await response;assert(!r.ok(),'Over-limit request unexpectedly accepted');return}
 const id=await submit(p,'Submit Request');await go(p,'/approvals/requests/'+id);return id
}
let workflowId,requestId,cancelId,delegationId
try{
 for(const [role,a] of Object.entries(fixture.accounts)){
  await record('Authentication '+role,async()=>{
   const c=await browser.createBrowserContext(),p=await c.newPage();pages[role]=p
   await p.goto('https://localhost:3443/login',{waitUntil:'networkidle2'})
   await p.type('#email',a.email);await p.type('#password',a.password)
   const response=p.waitForResponse(r=>r.url().includes('/api/auth/sign-in/email')&&r.request().method()==='POST')
   await p.click('button[type="submit"]');assert((await response).ok(),'Password authentication rejected')
   await p.waitForFunction(()=>!location.pathname.startsWith('/login'),{timeout:30000})
   await go(p,role==='platform'?'/platform':'/dashboard');await shot(p,role+'-landing')
   return {role,authentication:'real password UI and server session',propertyScope:a.propertyIds}
  })
 }
 const pdf=await browser.newPage();await pdf.setContent('<h1>Synthetic acceptance invoice</h1><p>No real financial information.</p>');await pdf.pdf({path:out+'/synthetic.pdf'});await pdf.close()
 for(const role of Object.keys(fixture.accounts)) if(pages[role]){
  await record('People Directory '+role,async()=>{const p=pages[role];const t=await go(p,'/people');assert(/People/.test(t));await shot(p,role+'-people');return {path:'/people'}})
  await record('Approvals navigation '+role,async()=>{const p=pages[role];const t=await go(p,'/approvals');assert(/Approvals Dashboard/.test(t));await shot(p,role+'-approvals');return {path:'/approvals'}})
 }
 await record('Cluster GM multi-property People profiles',async()=>{
  const p=pages.cluster
  for(const key of ['fenchurch-manager','lincoln-manager']){const m=fixture.people.find(x=>x.key===key);const t=await go(p,'/people/'+m.personId);assert(t.includes(m.firstName)&&t.includes(m.lastName),'Expected scoped profile not visible')}
  const t=await go(p,'/hospitality/properties');assert(t.includes('One Fifty Fenchurch')&&t.includes('The Lincoln Suites'));await shot(p,'cluster-two-properties')
 })
 await record('Restricted People profile isolation',async()=>{
  const p=pages.restricted,foreign=fixture.people.find(x=>x.key==='fenchurch-manager'),own=fixture.people.find(x=>x.key==='lincoln-manager')
  const allowed=await go(p,'/people/'+own.personId);assert(allowed.includes(own.firstName))
  const denied=await go(p,'/people/'+foreign.personId);assert(!denied.includes(foreign.email)&&!denied.includes(foreign.firstName+' '+foreign.lastName),'Foreign person exposed');assert(/not found|unavailable|404/i.test(denied),'No explicit denial evidence');await shot(p,'restricted-foreign-person-denied')
 })
 await record('Configure two-stage approval and financial limits through UI',async()=>{
  const p=pages.cluster;await go(p,'/approvals/configure')
  await select(p,'propertyId',fixture.properties[0].id)
  for(const [k,v] of Object.entries({name:'Browser acceptance two-stage',category:'Maintenance',maximumAmount:'5000',reminderHours:'1',stageName0:'Property approval',limit0:'5000'}))await type(p,k,v)
  await select(p,'currency','GBP');await select(p,'approver0',fixture.accounts.approver.tenantUserId);await select(p,'role0',fixture.approvalRole)
  await button(p,'Add stage');await type(p,'stageName1','Cluster approval');await type(p,'limit1','5000');await select(p,'approver1',fixture.accounts.cluster.tenantUserId);await select(p,'role1',fixture.approvalRole)
  workflowId=await submit(p,'Create Workflow');await shot(p,'configured-workflow');return {workflowId}
 })
 if(workflowId){
  await record('Financial request and PDF attachment through UI',async()=>{requestId=await createRequest('Synthetic browser financial request');const t=await go(pages.requester,'/approvals/requests/'+requestId);assert(t.includes('125.01'));await shot(pages.requester,'financial-request');return {requestId}})
  await record('Financial approval limit rejection through UI',()=>createRequest('Synthetic over-limit request','5001',true))
 }
 if(requestId){
  await record('Scoped attachment download',async()=>{const p=pages.requester;await go(p,'/approvals/requests/'+requestId+'?section=documents');const href=await p.$eval('a[href*="/documents/"]',e=>e.getAttribute('href'));const result=await p.evaluate(async href=>{const r=await fetch(href);return {status:r.status,type:r.headers.get('content-type'),size:(await r.arrayBuffer()).byteLength}},href);assert.equal(result.status,200);assert.equal(result.type,'application/pdf');assert(result.size>100);return result})
  await record('Restricted property request isolation',async()=>{const p=pages.restricted,t=await go(p,'/approvals/requests/'+requestId);assert(!t.includes('Synthetic browser financial request'));return {bodyExcerpt:t.slice(-300)}})
  await record('Comment and evidence history through UI',async()=>{await activity(pages.requester,requestId,'comment');const t=await go(pages.requester,'/approvals/requests/'+requestId+'?section=comments');assert(t.includes('Synthetic browser acceptance comment'));await shot(pages.requester,'request-comment')})
  await record('More information and requester resubmission through UI',async()=>{await activity(pages.approver,requestId,'more_info');let t=await go(pages.requester,'/approvals/requests/'+requestId);assert(/more info/i.test(t));await activity(pages.requester,requestId,'resubmit');t=await go(pages.requester,'/approvals/requests/'+requestId);assert(/pending/i.test(t))})
  await record('Manual reminder and audit timeline through UI',async()=>{await activity(pages.requester,requestId,'remind');const t=await go(pages.requester,'/approvals/requests/'+requestId);assert(/remind/i.test(t));await shot(pages.requester,'request-audit')})
  await record('Sequential two-stage decisions through UI',async()=>{for(const role of ['approver','cluster']){const p=pages[role];await go(p,'/approvals/requests/'+requestId);await select(p,'decision','approve');await type(p,'reason','Synthetic browser approved');await submit(p,'Submit Decision')}const t=await go(pages.requester,'/approvals/requests/'+requestId);assert(/approved/i.test(t));await shot(pages.requester,'request-approved')})
 }
 if(workflowId){
  await record('Requester cancellation through UI',async()=>{cancelId=await createRequest('Synthetic cancellation request');await activity(pages.requester,cancelId,'cancel');assert(/cancelled/i.test(await go(pages.requester,'/approvals/requests/'+cancelId)))})
  await record('Delegation preserves original approval history through UI',async()=>{delegationId=await createRequest('Synthetic delegation request');const p=pages.approver;await go(p,'/approvals/requests/'+delegationId);await select(p,'targetId',fixture.accounts.property.tenantUserId);const selectHandle=await p.$('select[name="targetId"]'),form=await selectHandle.evaluateHandle(x=>x.closest('form'));await(await form.$('textarea[name="body"]')).type('Synthetic browser delegation');await submit(p,'Delegate Approval');const q=pages.property,t=await go(q,'/approvals/requests/'+delegationId);assert(t.includes('Original approval stages'));assert(t.includes(fixture.accounts.approver.firstName));await select(q,'decision','approve');await type(q,'reason','Delegate decision');await submit(q,'Submit Decision');await shot(q,'delegated-decision')})
 }
 await record('Approvals reporting and CSV export through browser session',async()=>{const p=pages.cluster;await go(p,'/approvals/reports');const href=await p.$eval('a[href*="/approvals/export.csv"]',e=>e.getAttribute('href'));const result=await p.evaluate(async href=>{const r=await fetch(href);return {status:r.status,type:r.headers.get('content-type'),body:await r.text()}},href);assert.equal(result.status,200);assert(result.body.includes('Synthetic browser'));await shot(p,'approval-reports');return {status:result.status,type:result.type,rows:result.body.split('\n').length}})
 await record('Notifications page navigation',async()=>{const p=pages.approver;await go(p,'/notifications');await shot(p,'notifications')})
 for(const route of ['/people','/approvals']){
  await record('Mobile responsive navigation '+route,async()=>{const p=pages.cluster;await p.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await go(p,route);await shot(p,'mobile-'+route.slice(1));const m=await p.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('button')].map(x=>({label:x.getAttribute('aria-label')||x.textContent?.trim()}))}));assert(m.document<=m.viewport+2,'Page horizontal overflow');return m})
 }
 report.gaps.push('Automatic reminder timing and actual recipient notification/email delivery are NOT VERIFIED by this browser run; preserved integration evidence is separate.')
 report.gaps.push('Screenshot capture is evidence, not an automatic visual-fidelity pass. Compare actual rendered UI with approved Light/Terra originals, teal/coral branding and menu hierarchy.')
}catch(e){report.gaps.push('Browser harness interrupted: '+String(e.message).slice(0,1000))}
finally{
 await browser.close()
 report.status=report.checks.some(x=>x.status==='FAIL')?'ACCEPTANCE_GAPS':'PARTIAL_BROWSER_EVIDENCE'
 await writeFile(out+'/browser-acceptance.json',JSON.stringify(report,null,2))
 console.log('BROWSER_ACCEPTANCE_JSON='+JSON.stringify(report))
 
}
if(report.checks.some(x=>x.status==='FAIL'))process.exitCode=1

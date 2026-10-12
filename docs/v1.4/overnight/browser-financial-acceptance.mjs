import assert from 'node:assert/strict'
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const root=process.env.GITHUB_WORKSPACE, out=process.env.RUNNER_TEMP+'/financial-evidence'
if(process.env.GITHUB_ACTIONS!=='true'||process.env.APP_URL!=='https://localhost:3443')throw Error('Disposable browser boundary required')
await mkdir(out,{recursive:true})
const fixture=JSON.parse(await readFile(process.env.RUNNER_TEMP+'/dual-accounts.json','utf8'))
const req=createRequire(root+'/packages/forms-pdf/package.json')
const {default:puppeteer}=await import(req.resolve('puppeteer-core'))
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:1000}})
const report={sourceCommit:'563fb0e9b79a838a5f394abaffb2f7dc743fc571',sourceTree:'324c50a60e2cb0639ba920488a150c6531968374',runtime:'production Next standalone; disposable hosted CI',checks:[],screenshots:[],gaps:[],authenticationResponses:[],runtimeErrors:[]}
const pages={}
const pause=ms=>new Promise(r=>setTimeout(r,ms))
async function dismissTour(p){await pause(1400);const close=await p.$('button[aria-label="Close tour"]');if(close){await close.click();await p.waitForNetworkIdle({idleTime:300,timeout:5000}).catch(()=>{})}}

async function record(name,fn){try{const detail=await fn();report.checks.push({name,status:'PASS',detail});console.log('BROWSER_PASS '+name)}catch(e){report.checks.push({name,status:'FAIL',error:String(e.message).slice(0,1000)});console.log('BROWSER_FAIL '+name+': '+String(e.message).slice(0,400));for(const [role,p] of Object.entries(pages)){try{await shot(p,'failure-'+report.checks.length+'-'+role)}catch{}}}}
async function shot(p,name){await p.waitForFunction(()=>[...document.querySelectorAll('div[aria-hidden="true"]')].filter(e=>e.classList.contains('z-[100]')).every(e=>getComputedStyle(e).opacity==='0'),{timeout:20000});const path=out+'/'+name+'.png';await p.screenshot({path,fullPage:true});report.screenshots.push(name+'.png')}
async function go(p,path){const r=await p.goto('https://localhost:3443'+path,{waitUntil:'networkidle2',timeout:60000});assert(r&&r.status()<500,'Server error at '+path);assert(!new URL(p.url()).pathname.startsWith('/login'),'Unauthenticated redirect');await dismissTour(p);const text=await p.$eval('body',x=>x.innerText);assert(!/Application error:|Unable to load approvals/i.test(text),'Application error at '+path);return text}
async function type(p,name,value){const q='input[name="'+name+'"],textarea[name="'+name+'"],select[name="'+name+'"]';await p.waitForSelector(q);await p.$eval(q,x=>{x.value=''});await p.type(q,String(value))}
async function select(p,name,value){await p.select('select[name="'+name+'"]',String(value))}
async function button(p,text){await dismissTour(p);const h=await p.$$('button');for(const b of h){if((await b.evaluate(x=>x.textContent.trim()))===text){await b.click();return}}throw Error('Button missing: '+text)}
async function submit(p,label){const response=p.waitForResponse(r=>r.url().endsWith('/api/approvals')&&r.request().method()==='POST',{timeout:30000});await button(p,label);const r=await response;const j=await r.json();assert(r.ok(),j.error||'Request failed');assert(j.id,'Missing returned identity');await p.waitForNetworkIdle({idleTime:500,timeout:15000}).catch(()=>{});return j.id}

let workflowId,requestId
try{
 for(const [role,a] of Object.entries(fixture.accounts).filter(([role])=>['cluster','requester'].includes(role))){
  await record('Authentication '+role,async()=>{
   const c=await browser.createBrowserContext(),p=await c.newPage();pages[role]=p
   p.on('pageerror',e=>report.runtimeErrors.push({role,message:String(e.message).slice(0,500)}))
   await p.goto('https://localhost:3443/login',{waitUntil:'networkidle2'})
   await p.type('#email',a.email);await p.type('#password',a.password)
   for(let attempt=0;attempt<2;attempt++){
    const response=p.waitForResponse(r=>r.url().includes('/api/auth/sign-in/email')&&r.request().method()==='POST')
    await p.click('button[type="submit"]');const authResponse=await response
    const detail={role,attempt:attempt+1,status:authResponse.status(),retryAfter:authResponse.headers()['retry-after']??null}
    if(!authResponse.ok()){const error=await authResponse.json().catch(()=>({}));detail.code=String(error.code??'').slice(0,100);detail.message=String(error.message??'').slice(0,200)}
    report.authenticationResponses.push(detail);console.log('AUTH_RESPONSE '+JSON.stringify(detail))
    if(authResponse.ok())break
    if(authResponse.status()===429&&attempt===0){const seconds=Math.max(60,Number(detail.retryAfter)||0);assert(seconds<=120,'Unexpected retry interval');await pause(seconds*1000);continue}
    assert.fail('Password authentication rejected: HTTP '+authResponse.status()+' '+(detail.code??''))
   }
   await p.waitForFunction(()=>!location.pathname.startsWith('/login'),{timeout:30000})
   await go(p,role==='platform'?'/platform':'/dashboard');await shot(p,role+'-landing')
   await pause(12000)
   return {role,authentication:'real password UI and server session',propertyScope:a.propertyIds}
  })
 }

 const pdf=await browser.newPage();await pdf.setContent('<h1>Synthetic acceptance invoice</h1><p>No real financial information.</p>');await pdf.pdf({path:out+'/synthetic.pdf'});await pdf.close()
 await record('Focused financial field entry and persisted detail integrity',async()=>{
  const p=pages.cluster;await go(p,'/approvals/configure');await select(p,'propertyId',fixture.properties[0].id)
  for(const [k,v] of Object.entries({name:'Qualified financial fixture',category:'Maintenance',maximumAmount:'5000',reminderHours:'1',stageName0:'Property approval',limit0:'5000'}))await type(p,k,v)
  await select(p,'currency','GBP');await select(p,'approver0',fixture.accounts.approver.tenantUserId);await select(p,'role0',fixture.approvalRole);workflowId=await submit(p,'Create Workflow')
  const q=pages.requester;await go(q,'/approvals/new');await select(q,'workflowId',workflowId)
  const ambiguousFirstTag=await q.$eval('[name="description"]',e=>e.tagName)
  const values={title:'Synthetic qualified financial request',category:'Maintenance',amount:'125.01',supplier:'Synthetic supplier',description:'Disposable authenticated acceptance only'}
  for(const [name,value]of Object.entries(values)){
   await type(q,name,value)
   const actual=await q.$eval('input[name="'+name+'"],textarea[name="'+name+'"]',e=>e.value)
   assert.equal(actual,value,'Form field value mismatch: '+name)
  }
  await select(q,'currency','GBP');await(await q.$('input[type="file"]')).uploadFile(out+'/synthetic.pdf')
  await shot(q,'qualified-financial-form')
  requestId=await submit(q,'Submit Request');const text=await go(q,'/approvals/requests/'+requestId)
  const fields=await q.$$eval('dl > div',els=>Object.fromEntries(els.map(e=>[e.querySelector('dt')?.textContent?.trim(),e.querySelector('dd')?.textContent?.trim()])))
  assert.equal(fields.Supplier,values.supplier);assert.equal(fields.Amount,'GBP 125.01');assert.equal(fields.Category,values.category)
  assert(text.includes(values.description));assert(!fields.Supplier.includes(values.description),'Description leaked into supplier field')
  await shot(q,'qualified-financial-detail')
  return {requestId,ambiguousFirstTag,selector:'input/textarea/select qualified by name',persistedFields:fields,descriptionMatched:true}
 })
}catch(e){report.gaps.push('Focused harness interrupted: '+String(e.message))}
finally{await browser.close();report.status=report.checks.some(x=>x.status==='FAIL')?'ACCEPTANCE_GAPS':'FOCUSED_FINANCIAL_CHECK_PASS';await writeFile(out+'/browser-acceptance.json',JSON.stringify(report,null,2));console.log('FINANCIAL_ACCEPTANCE_JSON='+JSON.stringify(report))}
if(report.checks.some(x=>x.status==='FAIL'))process.exitCode=1

import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const root=process.env.GITHUB_WORKSPACE!
const raw=process.env.PEOPLE_PROVENANCE_TEST_DATABASE_URL!
const u=new URL(raw)
if(process.env.GITHUB_ACTIONS!=='true'||u.hostname!=='localhost'||u.pathname!=='/beaconhs_test')throw Error('Disposable CI boundary required')
const req=createRequire(root+'/packages/auth/package.json')
const { hashPassword }=await import(req.resolve('better-auth/crypto'))
const { createClient }=await import(root+'/packages/db/src/client.ts')
const {buildCycasDemoSeedPlan,cycasId}=await import(root+'/packages/db/src/cycas-demo-seed-plan.ts')
const {seedCycasDemo}=await import(root+'/packages/db/src/cycas-demo-seed-runner.ts')
const plan=buildCycasDemoSeedPlan()
for(const r of plan.roles){
 const extra=['approvals.read']
 if(r.key==='manager'||r.key==='admin')extra.push('approvals.configure','approvals.decide','approvals.submit','reports.read','admin.data.export')
 if(r.key==='frontOffice')extra.push('approvals.submit')
 if(r.key==='engineer')extra.push('approvals.decide')
 r.permissions.push(...extra.filter(x=>!r.permissions.includes(x)))
}
const approvalRole={id:cycasId('role:browser-approver'),key:'browser-approver',name:'Synthetic Approver',permissions:['approvals.read','approvals.decide']}
plan.roles.push(approvalRole)
for(const key of ['engineer','fenchurch-manager','cluster-gm']){
 const m=plan.staff.find(x=>x.key===key)!
 plan.roleAssignments.push({id:cycasId('browser-role:'+key),tenantId:plan.tenantId,tenantUserId:m.tenantUserId,roleId:approvalRole.id,scope:{type:'properties',propertyIds:[plan.properties[0]!.id]}})
}
const creds:Record<string,{password:string,passwordHash:string}>={}
for(const m of plan.staff){const password=randomBytes(24).toString('base64url');creds[m.email]={password,passwordHash:await hashPassword(password)}}
const client=createClient({url:raw,max:1})
try{
 await seedCycasDemo(client.db,plan,async()=>Object.fromEntries(Object.entries(creds).map(([k,v])=>[k,v.passwordHash])))
 await client.sql.unsafe('UPDATE "user" SET "isSuperAdmin"=true WHERE id=$1',[plan.staff.find(x=>x.key==='demo-admin')!.userId])
 await client.sql.unsafe("INSERT INTO tenant_module_entitlements(tenant_id,module_key,state,changed_by_user_id) VALUES($1,'approvals','enabled',$2)",[plan.tenantId,plan.staff[0]!.userId])
 const roles={platform:'demo-admin',cluster:'cluster-gm',property:'fenchurch-manager',approver:'engineer',requester:'fenchurch-front-office',restricted:'restricted-operations'}
 const accounts=Object.fromEntries(Object.entries(roles).map(([role,key])=>{const m=plan.staff.find(x=>x.key===key)!;return [role,{...m,password:creds[m.email]!.password}]}))
 await writeFile(process.env.RUNNER_TEMP+'/dual-accounts.json',JSON.stringify({tenantId:plan.tenantId,properties:plan.properties,approvalRole:approvalRole.id,accounts,people:plan.staff}),{mode:0o600})
 const storage=await import(root+'/packages/storage/src/index.ts')
 await storage.ensureBucket()
 console.log('SYNTHETIC_FIXTURE_READY: six requested browser personas; two synthetic hotel properties; no credentials logged')
}finally{await client.sql.end()}

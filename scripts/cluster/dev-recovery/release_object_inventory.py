#!/usr/bin/env python3
"""DEV storage inventory library. Admission is issued only by the complete collector."""
import datetime, hashlib, json, os, re, stat, subprocess, sys, time, uuid, xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit, quote
from concurrent.futures import ThreadPoolExecutor

TARGET = {'repository':'Satho82/beaconhs','environment':'dev','composeId':'wYb0LxLQrvj2FPI21i-Oj','stack':'uvanoo-v1-4-dev-gniriv','host':'dev.uvanoo.com','database':'uvanoo_dev','databaseHost':'uvanoo-dev-postgres','network':'uvanoo-dev-private'}
STACK = TARGET['stack']
ROLES = ['web','worker','scheduler','storage-init','collabora']
TERMINAL = {'complete','shutdown','failed','rejected','remove'}
ROOT = Path('/opt/uvanoo-dev/source-current')
ALLOWLIST_FILE = ROOT / 'packages/db/src/dev-historical-objects-allowlist.ts'
RECOVERY_FILE = Path('/opt/uvanoo-dev/artifacts/handover-recovery-evidence-20261029/nine-object-exception-evidence-v2.private.json')
EVIDENCE_PARENT = Path('/opt/uvanoo-dev/release-evidence')
SQL = """SELECT json_build_object(
  'database',current_database(),
  'rows',coalesce(json_agg(json_build_array(tenant_id::text,id::text,r2_key,created_at,size_bytes::text,content_type) ORDER BY id),'[]'::json),
  'tenant_branding',(SELECT coalesce(json_agg(json_build_array(id::text,branding->>'logoUrl',branding->>'pdfLetterhead') ORDER BY id),'[]'::json) FROM public.tenants),
  'platform_branding',(SELECT coalesce(json_agg(json_build_array(branding->>'logoKey',branding->>'faviconKey',branding->>'faviconContentType') ORDER BY id),'[]'::json) FROM public.platform_settings),
  'active_reservations',(SELECT count(*) FROM public.attachment_upload_reservations WHERE consumed_at IS NULL AND expires_at > now()),
  'outbox',(SELECT count(*) FROM public.storage_object_deletion_outbox),
  'approvals',(SELECT count(*) FROM public.approval_documents),
  'audit_r2_keys',(SELECT coalesce(json_agg(json_build_object('tenant',tenant_id::text,'key',metadata->>'r2Key','transient',metadata->'transient','attachmentId',metadata->>'attachmentId','size',metadata->>'sizeBytes','action',action)), '[]'::json) FROM public.audit_log WHERE metadata ? 'r2Key')
)::text FROM public.attachments"""
MINIO_COMMAND = r'''set -eu
case "$MINIO_ROOT_USER:$MINIO_ROOT_PASSWORD" in *[!a-zA-Z0-9:_-]*) exit 8;; esac
printf 'user = "%s:%s"\n' "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" | curl -sS --fail --connect-timeout 2 --max-time 3 --aws-sigv4 aws:amz:us-east-1:s3 --config - 'http://127.0.0.1:9000/uvanoo-dev?list-type=2'
'''

def fail(): raise ValueError('DEV_OBJECT_REFERENCE_PROBE_REJECTED')
def run(argv, *, timeout=4):
    p=subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True, timeout=timeout)
    if len(p.stdout)>4_000_000: fail()
    return p.stdout

def sha(value): return hashlib.sha256(value).hexdigest()
def canon(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def identity(row):
    if not isinstance(row,list) or len(row)!=6 or not all(isinstance(x,str) and x for x in row): fail()
    return sha(json.dumps(row,ensure_ascii=False,separators=(',',':')).encode())
def allowlist():
    matches=re.findall(r'(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])',ALLOWLIST_FILE.read_text())
    if len(matches)!=10 or len(set(matches[:9]))!=9: fail()
    return set(matches[:9]), matches[9]

def verify_recovery(expected):
    p=RECOVERY_FILE
    st=p.lstat()
    if p.resolve()!=p or not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_mode & 0o077 or st.st_size>1000000: fail()
    if sha(p.read_bytes())!=expected: fail()
    bundle=json.loads(p.read_bytes())
    names=['inventory.private.json','branding-identities-reconciliation.private.json','branding-current-dev-head.private.json','branding-legacy-admin-readonly.private.json','owner-approval-branding-20261029.private.json']
    if set(bundle)!={'approval','sources'} or bundle['approval']!='owner-approved-dev-nine-20261029' or not isinstance(bundle['sources'],list) or len(bundle['sources'])!=len(names): fail()
    if sorted(x.get('file') for x in bundle['sources'] if isinstance(x,dict))!=sorted(names): fail()
    for entry in bundle['sources']:
        if set(entry)!={'file','sha256'} or not re.fullmatch(r'[a-f0-9]{64}',entry['sha256']): fail()
        q=p.parent/entry['file']; qs=q.lstat()
        if q.resolve()!=q or not stat.S_ISREG(qs.st_mode) or qs.st_uid!=0 or qs.st_mode & 0o077 or qs.st_size>1000000 or sha(q.read_bytes())!=entry['sha256']: fail()

def retain(source, digest, evidence):
    directory=EVIDENCE_PARENT/source
    if directory.resolve()!=directory or not directory.is_dir(): fail()
    ds=directory.lstat()
    if ds.st_uid!=os.getuid() or ds.st_mode & 0o077: fail()
    out=directory/'object-observations'
    try: out.mkdir(mode=0o700)
    except FileExistsError: pass
    st=out.lstat()
    if out.resolve()!=out or not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode & 0o077: fail()
    path=out/(digest+'.json')
    try:
        fd=os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as f: f.write(evidence); f.flush(); os.fsync(f.fileno())
    except FileExistsError:
        st=path.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode & 0o077: fail()
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(fd,'rb') as f:
            if sha(f.read())!=digest: fail()
    dfd=os.open(out,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(dfd)
    finally: os.close(dfd)

def containers():
    items=json.loads(run(['docker','inspect','uvanoo-dev-minio','uvanoo-dev-postgres','uvanoo-dev-redis']))
    found={item.get('Name','').lstrip('/'):item for item in items}
    expected={
        'uvanoo-dev-minio':('minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e','uvanoo-dev-minio-data','/data'),
        'uvanoo-dev-postgres':('postgres@sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94','uvanoo-dev-postgres-data','/var/lib/postgresql/data'),
        'uvanoo-dev-redis':('redis@sha256:71da9275c5f3fcb97d0fa0c8c5b36cc995327265420f17a04bfd544f458059f7',None,None),
    }
    if set(found)!=set(expected): fail()
    result=[]
    for name,(image,volume,dest) in expected.items():
        item=found[name]
        if item.get('Config',{}).get('Image')!=image or item.get('State',{}).get('Health',{}).get('Status')!='healthy': fail()
        if set(item.get('NetworkSettings',{}).get('Networks',{}))!={'uvanoo-dev-private','uvanoo-dev-runtime'}: fail()
        mounts=item.get('Mounts',[])
        if volume is None:
            if mounts: fail()
        elif len(mounts)!=1 or mounts[0].get('Type')!='volume' or mounts[0].get('Name')!=volume or mounts[0].get('Destination')!=dest or mounts[0].get('RW') is not True: fail()
        result.append({'name':name,'id':item['Id'],'startedAt':item['State']['StartedAt'],'image':image,'volume':volume})
    return sorted(result,key=lambda x:x['name'])

def services():
    raw=run(['docker','service','inspect',*[STACK+'_'+r for r in ROLES]])
    items=json.loads(raw)
    if len(items)!=len(ROLES): fail()
    found={x['Spec']['Name']:x for x in items}
    if set(found)!={STACK+'_'+r for r in ROLES}: fail()
    env=found[STACK+'_web']['Spec']['TaskTemplate']['ContainerSpec']['Env']
    values={}
    for entry in env:
        k,sep,v=entry.partition('=')
        if not sep or k in values: fail()
        values[k]=v
    endpoint=urlsplit(values.get('R2_ENDPOINT',''))
    if endpoint.username is not None or endpoint.password is not None or endpoint.scheme!='http' or endpoint.hostname!='uvanoo-dev-minio' or endpoint.port!=9000 or endpoint.path not in ('','/') or endpoint.query or endpoint.fragment or values.get('R2_BUCKET')!='uvanoo-dev': fail()
    return items

def require_fence(items):
    if any(service['Spec']['Mode']['Replicated']['Replicas']!=0 for service in items): fail()
    def task_list(service): return run(['docker','service','ps','--no-trunc','-q',service['ID']]).decode().split()
    with ThreadPoolExecutor(max_workers=5) as pool:
        task_ids=[task for ids in pool.map(task_list,items) for task in ids]
    if task_ids:
        tasks=json.loads(run(['docker','inspect',*sorted(set(task_ids))]))
        if any(t.get('Status',{}).get('State') not in TERMINAL for t in tasks): fail()

def database():
    q='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout=1500; '+SQL+'; ROLLBACK;'
    raw=run(['docker','exec','uvanoo-dev-postgres','psql','-X','-q','-U','uvanoo_dev','-d','uvanoo_dev','-At','-v','ON_ERROR_STOP=1','-c',q])
    data=json.loads(raw)
    if data['database']!='uvanoo_dev' or data['active_reservations']!=0 or data['outbox']!=0 or data['approvals']!=0 or not isinstance(data['audit_r2_keys'],list) or not isinstance(data['rows'],list): fail()
    return data


def minio_get(suffix='', head=False):
    import datetime as dt
    cfg=Path('/opt/uvanoo-dev/monitor-private/minio-observer.json')
    st=cfg.lstat()
    if cfg.resolve()!=cfg or st.st_uid!=0 or stat.S_IMODE(st.st_mode)!=0o600: fail()
    c=json.loads(cfg.read_text())
    if dt.datetime.fromisoformat(c['expiresAt'].replace('Z','+00:00')).timestamp()<=time.time(): fail()
    credential=c['accessKey']+':'+c['secretKey']
    if not re.fullmatch(r'[A-Za-z0-9_+/=:-]+',credential): fail()
    pid=run(['docker','inspect','--format','{{.State.Pid}}','uvanoo-dev-minio']).decode().strip()
    if not pid.isdigit() or int(pid)<=0: fail()
    args=['nsenter','-t',pid,'-n','curl','--disable','-sS','--fail','--connect-timeout','1',
          '--max-time','2','--aws-sigv4','aws:amz:us-east-1:s3','--config','-']
    if head:args.append('--head')
    args.append('http://127.0.0.1:9000/uvanoo-dev'+suffix)
    v=subprocess.run(args,input=('user = '+json.dumps(credential)+'\n').encode(),
                     capture_output=True,timeout=3)
    if v.returncode or len(v.stdout)>4_000_000:fail()
    return v.stdout

def storage():
    root=ET.fromstring(minio_get('?list-type=2'))
    name=lambda x:x.rsplit('}',1)[-1]
    if [x.text for x in root if name(x.tag)=='IsTruncated']!=['false']:fail()
    out={}
    for child in root:
        if name(child.tag)!='Contents':continue
        fields={name(v.tag):v.text for v in child}
        key=fields.get('Key');size=fields.get('Size')
        if not isinstance(key,str) or not key or key in out or not str(size).isdigit():fail()
        out[key]=int(size)
    return out

def versions():
    root=ET.fromstring(minio_get('?versions'))
    name=lambda x:x.rsplit('}',1)[-1]
    if [x.text for x in root if name(x.tag)=='IsTruncated']!=['false']:fail()
    out=[];seen=set()
    for child in root:
        kind=name(child.tag)
        if kind not in ('Version','DeleteMarker'):continue
        fields={name(v.tag):v.text for v in child}
        key=fields.get('Key');version=fields.get('VersionId');latest=fields.get('IsLatest')
        size=fields.get('Size');modified=fields.get('LastModified')
        if not key or not version or latest not in ('true','false') or not modified or (key,version) in seen:fail()
        if kind=='Version' and not str(size).isdigit():fail()
        if kind=='DeleteMarker' and size is not None:fail()
        seen.add((key,version))
        out.append({'keySha256':sha(key.encode()),'versionSha256':sha(version.encode()),
                    'kind':kind,'latest':latest=='true','modified':modified,
                    'size':int(size) if size is not None else None})
    return sorted(out,key=lambda x:(x['keySha256'],x['versionSha256']))

def metadata_for(key):
    raw=minio_get('/'+quote(key,safe='/~'),True)
    fields={}
    for line in raw.decode('iso-8859-1').splitlines():
        k,sep,v=line.partition(':');k=k.strip().lower();v=v.strip()
        if sep and k in ('content-length','content-type'):
            if k in fields:fail()
            fields[k]=v
    if set(fields)!={'content-length','content-type'} or not fields['content-length'].isdigit():fail()
    return {'size':int(fields['content-length']),'contentType':fields['content-type'].lower()}

def is_uuid(value):
    try: return str(uuid.UUID(value)).lower()==value.lower()
    except (ValueError,TypeError,AttributeError): return False

def brand_references(db):
    out=[]
    if not isinstance(db.get('tenant_branding'),list) or not isinstance(db.get('platform_branding'),list): fail()
    for row in db['tenant_branding']:
        if not isinstance(row,list) or len(row)!=3 or not is_uuid(row[0]): fail()
        tenant,logo,letterhead=row
        for kind,key in [('logo',logo),('letterhead',letterhead)]:
            if key is None or key=='': continue
            if not isinstance(key,str): fail()
            match=re.fullmatch(r'tenants/([^/]+)/branding/(logo|letterhead)/([^/]+)\.(png|jpg|webp|pdf)',key,re.I)
            if not match:
                # URLs can point to configured object storage; no mapping has
                # been proven, so a URL must never be silently excluded.
                fail()
            owner,actual,asset,extension=match.groups(); ext=extension.lower()
            if not is_uuid(owner) or not is_uuid(asset) or owner.lower()!=tenant.lower() or actual.lower()!=kind or (kind=='letterhead' and ext!='pdf') or (kind=='logo' and ext not in ('png','jpg','webp')): fail()
            out.append({'key':key,'kind':kind,'expectedType':{'png':'image/png','jpg':'image/jpeg','webp':'image/webp','pdf':'application/pdf'}[ext],'identity':sha(canon(['tenant-brand',tenant,kind,key]))})
    for row in db['platform_branding']:
        if not isinstance(row,list) or len(row)!=3: fail()
        for kind,key in [('logo',row[0]),('favicon',row[1])]:
            if key is None or key=='': continue
            if not isinstance(key,str): fail()
            match=re.fullmatch(r'platform/branding/(logo|favicon)/([0-9a-f-]{36})\.(png|jpg|webp|ico)',key)
            if not match: fail()
            actual,asset,extension=match.groups()
            if actual!=kind or not is_uuid(asset): fail()
            types={'png':'image/png','jpg':'image/jpeg','webp':'image/webp','ico':'image/x-icon'}
            expected=types[extension]
            if kind=='favicon' and row[2]:
                if row[2] not in ('image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon'): fail()
                expected=row[2]
            out.append({'key':key,'kind':kind,'expectedType':expected,'identity':sha(canon(['platform-brand',kind,key]))})
    if len({x['key'] for x in out})!=len(out): fail()
    return out

REDIS_LUA = r'''local c='0';local n=0;local rows={};repeat local r=redis.call('SCAN',c,'MATCH','bull:*','COUNT',200);c=r[1];for _,k in ipairs(r[2]) do n=n+1;if n>2000 or #k>1024 then return redis.error_reply('UNSUPPORTED_INVENTORY') end;local t=redis.call('TYPE',k).ok;local has=t=='hash' and redis.call('HEXISTS',k,'data')==1;local d=has and redis.call('HGET',k,'data') or '';local v=has and (redis.call('HGET',k,'returnvalue') or '') or '';local name=has and (redis.call('HGET',k,'name') or '') or '';if #d>1000000 or #v>1000000 or #name>128 then return redis.error_reply('UNSUPPORTED_INVENTORY') end;table.insert(rows,{k,t,has,d,v,name}) end until c=='0';return cjson.encode(rows)'''
REDIS_COMMAND = 'export REDISCLI_AUTH="$DEV_REDIS_PASSWORD"; exec redis-cli --no-auth-warning --raw EVAL "$1" 0'
KNOWN_QUEUES={'ai','emails','notifications','outbound','pdfs','push','reports','scheduled'}
RESERVED={'meta':'hash','events':'stream','id':'string','marker':'zset','wait':'list','active':'list','completed':'zset','failed':'zset','delayed':'zset','prioritized':'zset','paused':'list','stalled':'set','stalled-check':'string','repeat':'zset','limiter':'string','pc':'string','de':'zset','priority':'string'}

def contains_storage_reference(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if key.lower() in ('r2key','objectkey','storagekey','stagingkey') and item not in (None,''): return True
            if contains_storage_reference(item): return True
    elif isinstance(value,list): return any(contains_storage_reference(x) for x in value)
    elif isinstance(value,str):
        return bool(re.search(r'(?:^|[\s\"\'=:/])(t/[0-9a-f-]{36}/|tenants/[0-9a-f-]{36}/branding/|platform/branding/)',value,re.I))
    return False

def queue_inventory():
    raw=run(['docker','exec','uvanoo-dev-redis','sh','-c',REDIS_COMMAND,'sh',REDIS_LUA])
    rows=json.loads(raw)
    if rows=={}: rows=[]
    if not isinstance(rows,list) or len(rows)>2000: fail()
    seen=set(); evidence=[]; references=[]
    for row in rows:
        if not isinstance(row,list) or len(row)!=6: fail()
        key,typ,has,data,returned,name=row
        if not isinstance(key,str) or key in seen or not isinstance(has,bool): fail()
        seen.add(key); parts=key.split(':')
        if len(parts)<3 or parts[0]!='bull' or parts[1] not in KNOWN_QUEUES: fail()
        queue=parts[1]
        if not has:
            if len(parts)!=3 or parts[2] not in RESERVED or RESERVED[parts[2]]!=typ: fail()
            continue
        if typ!='hash' or not isinstance(data,str) or not isinstance(returned,str) or not isinstance(name,str): fail()
        job=json.loads(data); result=json.loads(returned) if returned else None
        if not isinstance(job,dict): fail()
        if queue=='pdfs':
            if name!='document_master_pdf' or set(job)!={'kind','tenantId','documentId'} or job['kind']!='document_master_pdf' or not is_uuid(job['tenantId']) or not is_uuid(job['documentId']): fail()
            if result is not None:
                if not isinstance(result,dict) or not {'r2Key','sizeBytes','filename'}<=set(result) or set(result)-{'attachmentId','r2Key','sizeBytes','filename'}: fail()
                key2=result['r2Key']; size=result['sizeBytes']
                if not isinstance(key2,str) or not key2.startswith('t/'+job['tenantId']+'/') or not isinstance(size,int) or isinstance(size,bool) or size<=0 or not isinstance(result['filename'],str): fail()
                references.append({'key':key2,'expectedType':'application/pdf','size':size,'identity':sha(canon(['queue-pdf',key,job['tenantId'],key2,str(size)]))})
            if contains_storage_reference(job): fail()
        elif queue=='emails':
            if name!='send' or not {'to','subject','html','text'}<=set(job) or set(job)-{'to','subject','html','text','meta','attachments'} or job.get('attachments') not in (None,[]): fail()
            if not isinstance(job['subject'],str) or not isinstance(job['html'],str) or not isinstance(job['text'],str): fail()
            if result is not None or contains_storage_reference(job): fail()
        else: fail()
        evidence.append({'jobKeySha256':sha(key.encode()),'queue':queue,'dataSha256':sha(data.encode()),'returnSha256':sha(returned.encode())})
    if len({x['key'] for x in references})!=len(references): fail()
    return {'references':references,'evidence':sorted(evidence,key=lambda x:x['jobKeySha256']),'keyCount':len(rows)}

def metadata(db, objects, queue):
    keys=sorted(objects)  # Observe every retained object, including unreferenced recovery bytes.
    with ThreadPoolExecutor(max_workers=4) as pool:
        values=list(pool.map(metadata_for,keys))
    return dict(zip(keys,values))


def audit_references(db, objects, queue):
    evidence=[]
    for item in db['audit_r2_keys']:
        if not isinstance(item,dict) or set(item)!={'tenant','key','transient','attachmentId','size','action'}: fail()
        key=item['key']; tenant=item['tenant']
        if not is_uuid(tenant) or not isinstance(key,str) or not key.startswith('t/'+tenant+'/') or item['action']!='export': fail()
        temporary=(item['transient'] is True and item['attachmentId'] is None
                   and key.startswith('t/'+tenant+'/_transient/pdfs/'))
        referenced=any(r[2]==key for r in db['rows']) or any(r['key']==key for r in queue['references'])
        # Export audit records describe events, not retention promises. Only an
        # explicitly transient, unreferenced artifact has the source-defined
        # consume-and-delete lifecycle. Durable/current references still fail.
        if key not in objects and not (temporary and not referenced): fail()
        if key in objects and (not isinstance(item['size'],str)
                               or not item['size'].isdigit() or int(item['size'])!=objects[key]): fail()
        evidence.append({'keySha256':sha(key.encode()),'transient':temporary,
                         'currentlyReferenced':referenced,'present':key in objects})
    return sorted(evidence,key=lambda x:x['keySha256'])

def reconcile(db, objects, approved, observed_metadata, observed_versions, queue):
    missing=[]; refs=[]; seen=set()
    for row in db['rows']:
        ident=identity(row); key=row[2]
        if key in seen: fail()
        seen.add(key); refs.append(ident)
        if key not in objects:
            missing.append(ident)
        elif int(row[4])!=objects[key] or observed_metadata.get(key)!={'size':int(row[4]),'contentType':row[5].lower()}: fail()
    brands=brand_references(db)
    for b in brands:
        key=b['key']
        if key in seen: fail()
        seen.add(key)
        if key not in objects: missing.append(b['identity'])
        else:
            meta=observed_metadata.get(key)
            if not isinstance(meta,dict) or meta.get('size')!=objects[key] or meta.get('size',0)<=0 or meta.get('contentType')!=b['expectedType'].lower(): fail()
        refs.append(b['identity'])
    if len(set(missing))!=len(missing) or len(missing)>9 or not set(missing)<=approved: fail()
    for item in queue['references']:
        key=item['key']
        if key not in objects: fail()
        meta=observed_metadata.get(key)
        if not isinstance(meta,dict) or meta.get('size')!=objects[key] or meta.get('size')!=item['size'] or meta.get('contentType')!=item['expectedType']: fail()
        refs.append(item['identity'])
    evidence={'auditReferences':audit_references(db,objects,queue),'queueInventory':queue['evidence'],'queueKeyCount':queue['keyCount'],'referenceIdentities':sorted(refs),'inventory':sorted([{'keySha256':sha(k.encode()),'size':v} for k,v in objects.items()], key=lambda x:x['keySha256']),'objectMetadata':sorted([{'keySha256':sha(k.encode()),**v} for k,v in observed_metadata.items()],key=lambda x:x['keySha256']),'versionInventory':observed_versions,'approvedMissingIdentities':sorted(missing),'activeReservations':db['active_reservations'],'outbox':db['outbox'],'approvals':db['approvals']}
    return sorted(missing), canon(evidence)

def sample():
    with ThreadPoolExecutor(max_workers=3) as pool:
        db=pool.submit(database); objects=pool.submit(storage); history=pool.submit(versions); queue=pool.submit(queue_inventory)
        return db.result(),objects.result(),history.result(),queue.result()

import fs from 'node:fs'
import ts from 'typescript'
import { systemMessageKey } from '@beaconhs/i18n/messages'
import { findSourceAudit,normalizeProse } from './i18n-source-audit'
import { findRuntimeUserFacingLiterals } from './i18n-runtime-audit'

process.chdir(new URL('../../..',import.meta.url).pathname)
const draft=JSON.parse(fs.readFileSync('/tmp/uvanoo-production-draft.json','utf8'))
const sources=new Set<string>()
const attrs=new Set(['actionLabel','alt','aria-label','buttonLabel','cancelLabel','description','label','loadingLabel','message','placeholder','title','tooltip'])
for(const path of Object.keys(draft.files).filter(p=>p.endsWith('.tsx'))) {
  let source=fs.readFileSync(path,'utf8')
  const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const edits:Array<{start:number;end:number;text:string}>=[]
  let usesValue=false,usesTranslator=false
  function add(node:ts.Node,text:string){edits.push({start:node.getStart(file),end:node.end,text})}
  function visit(node:ts.Node) {
    if(ts.isJsxText(node)&&/[A-Za-z]/.test(node.text)) {
      const value=normalizeProse(node.text)
      sources.add(value)
      let p:ts.Node|undefined=node.parent;let option=false
      while(p){if(ts.isJsxElement(p)&&p.openingElement.tagName.getText(file)==='option')option=true;p=p.parent}
      if(option){add(node,'{tGeneratedValue('+JSON.stringify(value)+')}');usesTranslator=true}
      else{add(node,'<GeneratedValue value={'+JSON.stringify(value)+'} />');usesValue=true}
      return
    }
    if(ts.isJsxAttribute(node)&&attrs.has(node.name.getText(file))&&node.initializer) {
      if(ts.isStringLiteral(node.initializer)) {
        sources.add(node.initializer.text)
        add(node.initializer,'{tGeneratedValue('+JSON.stringify(node.initializer.text)+')}')
        usesTranslator=true;return
      }
      if(ts.isJsxExpression(node.initializer)&&node.initializer.expression) {
        const e=node.initializer.expression
        add(e,'tGeneratedValue('+e.getText(file)+')');usesTranslator=true;return
      }
    }
    if(ts.isJsxExpression(node)&&node.expression&&ts.isJsxElement(node.parent)) {
      const expr=node.expression
      if(!expr.getText(file).includes('<')&&!ts.isArrowFunction(expr)) {
        add(node,'<GeneratedValue value={'+expr.getText(file)+'} />');usesValue=true;return
      }
    }
    ts.forEachChild(node,visit)
  }
  visit(file)
  const client=source.startsWith("'use client'")
  if(usesTranslator) {
    for(const n of file.statements)if(ts.isFunctionDeclaration(n)&&n.body&&n.body.getText(file).includes('<')) {
      if(!client&&!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))edits.push({start:n.getStart(file),end:n.getStart(file),text:''})
      edits.push({start:n.body.getStart(file)+1,end:n.body.getStart(file)+1,text:client?'\nconst tGeneratedValue=useGeneratedValueTranslations()\n':'\nconst tGeneratedValue=await getGeneratedValueTranslations()\n'})
    }
  }
  for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end)
  const imports=(usesValue?'import { GeneratedValue } from "@/i18n/generated"\n':'')+(usesTranslator?(client?'import { useGeneratedValueTranslations } from "@/i18n/generated"\n':'import { getGeneratedValueTranslations } from "@/i18n/generated.server"\n'):'')
  if(client)source=source.replace("'use client'","'use client'\n"+imports)
  else source=imports+source
  fs.writeFileSync(path,source)
}
const audit=findSourceAudit()
for(const item of [...audit.optionLabels,...findRuntimeUserFacingLiterals()])sources.add(item.source)
const {WALKTHROUGHS}=await import('../src/lib/walkthroughs/registry')
const {APPROVALS_ARTICLE}=await import('../src/lib/manual/content/approvals')
for(const tour of WALKTHROUGHS)for(const step of tour.steps)sources.add(step.body)
sources.add(APPROVALS_ARTICLE.body)
const missing:string[]=[]
for(const lang of ['en','es','fr']){
  const path='packages/i18n/src/messages/'+lang+'.json'
  const data=JSON.parse(fs.readFileSync(path,'utf8'))
  for(const source of sources) {
    const key=systemMessageKey(source)
    if(!(key in data.Generated)){data.Generated[key]=source;if(lang==='en')missing.push(source)}
  }
  fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n')
}
console.log('MISSING_TRANSLATIONS='+JSON.stringify(missing))
console.log('JSX_VIOLATIONS='+JSON.stringify(findSourceAudit().violations))

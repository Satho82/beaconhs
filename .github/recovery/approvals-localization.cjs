const fs = require('node:fs')
const path = require('node:path')
const {createRequire} = require('node:module')
const requireWeb = createRequire(path.join(process.cwd(), 'apps/web/package.json'))
const ts = requireWeb('typescript')
function key(source){let high=0xdeadbeef,low=0x41c6ce57;for(let i=0;i<source.length;i++){let c=source.charCodeAt(i);high=Math.imul(high^c,2654435761);low=Math.imul(low^c,1597334677);}high=Math.imul(high^(high>>>16),2246822507);high^=Math.imul(low^(low>>>13),3266489909);low=Math.imul(low^(low>>>16),2246822507);low^=Math.imul(high^(high>>>13),3266489909);return `m_${(4294967296*(2097151&low)+(high>>>0)).toString(16).padStart(14,"0")}`;}
const userAttributes = new Set(['actionLabel','alt','aria-label','buttonLabel','cancelLabel','cancelText','caption','confirmLabel','confirmText','description','dialogDescription','dialogTitle','emptyLabel','emptyText','errorMessage','heading','helperText','hint','label','loadingLabel','message','noResultsText','placeholder','prompt','searchPlaceholder','srLabel','submitLabel','subtitle','successMessage','title','tooltip'])
function normalize(value) {
  return value.replaceAll('&apos;', "'").replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ').replaceAll('&rsquo;', '’').replaceAll('&lsquo;', '‘').replaceAll('&ldquo;', '“').replaceAll('&rdquo;', '”').replaceAll('&hellip;', '…').replaceAll('&mdash;', '—').replaceAll('&ndash;', '–').replaceAll('&amp;', '&').replace(/\s+/g, ' ').trim()
}
function words(value) { return /[A-Za-zÀ-ÿ]/.test(normalize(value)) }
function option(node) {
  for(let p=node.parent;p;p=p.parent) if(ts.isJsxElement(p) && p.openingElement.tagName.getText()==='option') return true
  return false
}
function literals(expression) {
  if(ts.isStringLiteral(expression)||ts.isNoSubstitutionTemplateLiteral(expression)) return words(expression.text)?[expression]:[]
  if(ts.isTemplateExpression(expression)) return [expression]
  if(ts.isParenthesizedExpression(expression)) return literals(expression.expression)
  if(ts.isConditionalExpression(expression)) return [...literals(expression.whenTrue),...literals(expression.whenFalse)]
  if(ts.isBinaryExpression(expression) && [ts.SyntaxKind.QuestionQuestionToken,ts.SyntaxKind.BarBarToken].includes(expression.operatorToken.kind)) return [...literals(expression.left),...literals(expression.right)]
  return []
}
const known = JSON.parse(fs.readFileSync('packages/i18n/src/messages/en.json','utf8')).Generated
const required = new Set()
for(const file of ['apps/web/src/app/preview/approvals/login/page.tsx','apps/web/src/app/preview/approvals/preview.client.tsx']) {
  let input = fs.readFileSync(file,'utf8')
  const sf=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  const edits=[],functions=new Set()
  function owner(node) {
    let fn
    for(let p=node;p;p=p.parent) if(ts.isFunctionDeclaration(p)) fn=p
    if(!fn || !fn.body) throw new Error('No top-level component for translation')
    functions.add(fn)
  }
  function translate(literal) {
    let source,values=[]
    if(ts.isTemplateExpression(literal)) {
      source=literal.head.text
      for(const [i,span]of literal.templateSpans.entries()) {
        source+='{value'+i+'}'+span.literal.text
        values.push('value'+i+': '+span.expression.getText(sf))
      }
    } else source=literal.text
    source=normalize(source)
    required.add(source)
    return "translateApprovals('"+key(source)+"'"+(values.length?', { '+values.join(', ')+' }':'')+')'
  }
  function visit(node) {
    if(ts.isJsxText(node) && words(node.text) && !option(node)) {
      owner(node)
      const source=normalize(node.text)
      required.add(source)
      const prefix=/^\s/.test(node.text)?"{' '}":''
      const suffix=/\s$/.test(node.text)?"{' '}":''
      edits.push({start:node.pos,end:node.end,text:prefix+"{translateApprovals('"+key(source)+"')}"+suffix})
      return
    }
    if(ts.isJsxAttribute(node) && userAttributes.has(node.name.getText(sf)) && node.initializer) {
      if(ts.isStringLiteral(node.initializer) && words(node.initializer.text)) {
        owner(node)
        edits.push({start:node.initializer.getStart(sf),end:node.initializer.end,text:'{'+translate(node.initializer)+'}'})
        return
      }
      if(ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        for(const literal of literals(node.initializer.expression)) {
          owner(node)
          edits.push({start:literal.getStart(sf),end:literal.end,text:translate(literal)})
        }
        return
      }
    }
    if(ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent) && !option(node)) {
      for(const literal of literals(node.expression)) {
        owner(node)
        edits.push({start:literal.getStart(sf),end:literal.end,text:translate(literal)})
      }
    }
    ts.forEachChild(node,visit)
  }
  visit(sf)
  const server = file.endsWith('/login/page.tsx')
  for(const fn of functions) edits.push({start:fn.body.getStart(sf)+1,end:fn.body.getStart(sf)+1,text:'\n  const translateApprovals = '+(server?'await getGeneratedTranslations()':'useGeneratedTranslations()')+'\n'})
  edits.sort((a,b)=>b.start-a.start)
  let prior=input.length+1
  for(const edit of edits) {
    if(edit.end>prior) throw new Error('Overlapping translation edit')
    input=input.slice(0,edit.start)+edit.text+input.slice(edit.end)
    prior=edit.start
  }
  const declaration=server?"import { getGeneratedTranslations } from '@/i18n/generated.server'\n":"import { GeneratedValue, useGeneratedTranslations } from '@/i18n/generated'\n"
  input=server?declaration+input:input.replace("'use client'\n","'use client'\n"+declaration)
  if(!server) {
    for(const identifier of ['title','subtitle','body','label','item','status','error','message','saved']) {
      input=input.replaceAll('>{'+identifier+'}<','><GeneratedValue value={'+identifier+'} /><')
    }
  }
  fs.writeFileSync(file,input)
}
for(const source of required) if(known[key(source)]===undefined) throw new Error('Missing authored translation: '+source)
console.log('Localized '+required.size+' unique source strings without audit exclusions')

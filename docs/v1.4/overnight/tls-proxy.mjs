import https from 'node:https'
import http from 'node:http'
import { readFileSync } from 'node:fs'
if(process.env.GITHUB_ACTIONS!=='true'||process.env.APP_URL!=='https://localhost:3443')throw Error('Disposable TLS boundary required')
const tls=process.env.RUNNER_TEMP+'/browser-tls'
https.createServer({key:readFileSync(tls+'/server.key'),cert:readFileSync(tls+'/server.crt')},(req,res)=>{
 const upstream=http.request({hostname:'127.0.0.1',port:3000,path:req.url,method:req.method,headers:{...req.headers,host:'localhost:3443','x-forwarded-host':'localhost:3443','x-forwarded-proto':'https','x-forwarded-for':'127.0.0.1'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)})
 upstream.on('error',()=>{res.writeHead(502);res.end('Disposable upstream unavailable')})
 req.pipe(upstream)
}).listen(3443,'127.0.0.1',()=>console.log('Disposable HTTPS proxy listening on loopback'))

import http from "node:http";
import {readFileSync} from "node:fs";
import {resolve,join} from "node:path";
const directory=resolve(process.argv[2]||"");
if(!process.argv[2])throw new Error("Provide preview directory");
const pages=new Set(["/","/index.html","/dashboard.html"]);
http.createServer((req,res)=>{if(!pages.has(req.url||"")){res.writeHead(404).end();return;}res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(readFileSync(join(directory,req.url==="/dashboard.html"?"dashboard.html":"index.html")));}).listen(3887,"127.0.0.1",()=>console.log("Preview http://127.0.0.1:3887"));

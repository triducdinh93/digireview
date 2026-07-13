import fs from "node:fs/promises";
import vm from "node:vm";
await import("./content-schema.js");
const Schema = globalThis.DigiReviewContentSchema;
const required = ["index.html","admin.html","admin.js","app.js","style.css","content-schema.js","extract-google-sites.mjs","audit-content-layout.mjs","audit-safe-flow-fixtures.mjs","package.json","package-lock.json"];
const missing = [];
for (const file of required) { try { await fs.access(file); } catch { missing.push(file); } }
const index = await fs.readFile("index.html","utf8");
const admin = await fs.readFile("admin.html","utf8");
const extractor = await fs.readFile("extract-google-sites.mjs","utf8");
const postsSource = await fs.readFile("posts.js","utf8");
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(postsSource,ctx);
const posts=ctx.window.BLOG_DATA.posts||[];
const fixture=Schema.normalizeModel({blocks:[
 {type:"heading",level:2,text:"Overview"},
 {type:"paragraph",text:"A sufficiently detailed structured paragraph explains the product clearly without importing any source page layout or arbitrary styling. The structured model stores only readable information, headings, lists, images, videos, tables and frequently asked questions. Every component is rendered by DigiReview using a fixed design system, so content from a new source cannot inject columns, cards, oversized labels, duplicate calls to action or conflicting CSS rules. Editors can review and change every block before publishing the article."},
 {type:"list",style:"check",items:["✓ First benefit","✓ Second benefit"]},
 {type:"video",src:"https://example.com/demo.mp4",caption:"Demo"},
 {type:"table",headers:["Plan","Price"],rows:[["Standard","$97"],["Launch","$39"]]}
],cta:{enabled:true,url:"https://example.com/offer",buttonLabel:"View Offer"}});
const rendered=Schema.renderBlocks(fixture);
const cta=Schema.renderCta(fixture.cta);
const issues=[];
if(missing.length)issues.push(`Missing files: ${missing.join(", ")}`);
if(index.indexOf("content-schema.js")>index.indexOf("app.js"))issues.push("index.html loads app.js before content-schema.js");
if(admin.indexOf("content-schema.js")>admin.indexOf("admin.js"))issues.push("admin.html loads admin.js before content-schema.js");
if(!admin.includes('name="ctaUrl"')||!admin.includes('id="blocks-editor"'))issues.push("Admin standard CTA or block editor is missing");
if(/clone\.innerHTML|style\.cssText|className\s*=\s*source/i.test(extractor))issues.push("Extractor appears to copy source layout HTML or styling");
if((cta.match(/<a /g)||[]).length!==1)issues.push("Standard CTA did not render exactly one hyperlink");
if(rendered.includes("✓ First benefit"))issues.push("List icon prefix was not normalized");
if(!rendered.includes('data-dr-schema="dr-content-v1"'))issues.push("Canonical schema root is missing");
console.log(JSON.stringify({issues,posts:posts.length,googleSites:posts.filter(p=>/^https:\/\/sites\.google\.com\//.test(p.externalUrl||"")).length,canonical:posts.filter(p=>p.contentModel?.blocks).length,fixtureAudit:Schema.audit(fixture)},null,2));
if(issues.length)process.exitCode=1;

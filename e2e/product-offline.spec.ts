import { test, expect } from "./offline-test";
import { signInDemo, json } from "./auth-fixture";
import { demoDataset } from "../lib/seed";
import { DEMO_FAMILY_ID } from "../lib/demo";
import { buildBriefing } from "../lib/briefing";
import type { MemoryRow } from "../lib/types";
import AxeBuilder from "@axe-core/playwright";

const data=demoDataset(DEMO_FAMILY_ID);
const nora=data.nodes.find(n=>n.label==="Nora")!;
const briefing=buildBriefing(DEMO_FAMILY_ID,nora,data.memories as MemoryRow[],data.provenance,data.relatives);

test.beforeEach(async({page,context})=>{
  // No unmocked external request or local mutation route can reach a backend.
  await context.route("**/*",route=>{
    const url=new URL(route.request().url());
    if(url.origin!=="http://localhost:3197" || url.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
  await context.routeWebSocket("**/*",socket=>socket.close());
  await page.route("**/rest/v1/**",route=>{
    const table=new URL(route.request().url()).pathname.split("/").at(-1)!;
    const rows:Record<string,unknown>={wearer:{name:"Rosa"},graph_nodes:data.nodes,graph_edges:data.edges,memories:data.memories,relatives:data.relatives,provenance:data.provenance};
    return route.fulfill(json(rows[table]??[]));
  });
  await page.route("**/api/prepare",route=>route.fulfill(json({briefings:[briefing]})));
});

test("Prepare requires a session and makes no camera request",async({page})=>{
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new Error("Prepare must not request media");};});
  await page.goto("/prepare"); await expect(page.getByRole("button",{name:"Sign in",exact:true})).toBeVisible();
});
for (const width of [375,1440]) test(`Prepare shows grounded context, source and explanations at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await signInDemo(page,"/prepare",false,undefined,"Rosa");
  await page.getByRole("button",{name:/Nora Your sister/}).click();
  const card=page.getByRole("article",{name:"Memories of Nora"});
  await expect(card.getByRole("heading",{name:"Nora"})).toBeVisible();
  await expect(card.getByText("Your sister",{exact:true})).toBeVisible();
  await expect(card.getByText(`“${briefing.context.facts[0].text}”`,{exact:true}).first()).toBeVisible();
  await page.screenshot({path:`test-results/prepare-${width}.png`,fullPage:true});
  await card.getByText("More context",{exact:true}).click();
  await expect(card.getByText(/Elena remembers/).first()).toBeVisible();
  await card.getByText("Why this?",{exact:true}).click();
  await expect(card.getByText(/not a camera identification/)).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const audit=await new AxeBuilder({page}).include('main').analyze();
  expect(audit.violations.filter(v=>v.impact==='critical'||v.impact==='serious')).toEqual([]);
  await card.getByRole("link",{name:"View source in Atlas"}).first().click();
  await expect(page).toHaveURL(/\/graph\?memory=/);
  await expect(page.getByRole("complementary",{name:"Connection details"}).getByText(/Shared by/)).toBeVisible();
});

test("empty, insufficient, disputed and failed reads never substitute a made-up quote",async({page})=>{
  let body:unknown={briefings:[]}; let status=200;
  await page.route("**/api/prepare",route=>route.fulfill(json(body,status)));
  await signInDemo(page,"/prepare",false,undefined,"Rosa");
  await expect(page.getByText("Your people will appear here.")).toBeVisible();
  for(const state of ["insufficient","disputed"]){
    body={briefings:[{...briefing,status:state,context:{...briefing.context,facts:[],supporters:[],memoryCount:0}}]};
    await page.reload();await page.getByRole("button",{name:/Nora Your sister/}).click();
    await expect(page.locator("blockquote")).toHaveCount(0);
    await expect(page.getByText(state==="disputed"?"These memories need a little care.":"A little more family context is needed.")).toBeVisible();
  }
  status=503;await page.reload();await expect(page.locator("main").getByRole("alert")).toContainText("couldn’t be loaded");
  status=200;body={briefings:[briefing]};await page.getByRole("button",{name:"Try again"}).click();
  await expect(page.getByRole("button",{name:/Nora Your sister/})).toBeVisible();
  await page.getByRole("button",{name:"Sign out"}).click();
  await expect(page.getByRole("button",{name:/Nora/})).toHaveCount(0);
});

test("wearer sees identity then a named quote; new SILENT clears all previous evidence",async({page})=>{
  await page.setViewportSize({width:375,height:900});
  await page.addInitScript(()=>{
    Object.defineProperty(HTMLVideoElement.prototype,"videoWidth",{get:()=>16});
    Object.defineProperty(HTMLVideoElement.prototype,"videoHeight",{get:()=>16});
    HTMLCanvasElement.prototype.toBlob=function(callback){callback(new Blob(["offline image"],{type:"image/jpeg"}));};
    CanvasRenderingContext2D.prototype.drawImage=function(){};
    HTMLMediaElement.prototype.play=async function(){};
    navigator.mediaDevices.getUserMedia=async()=>new MediaStream();
    window.speechSynthesis.speak=()=>{};
  });
  let calls=0;
  await page.route("**/api/recall",route=>route.fulfill(json(++calls===1?{decision:"speak",cueText:"Maya said: “Nora baked lemon cake.”",audio:null,context:{...briefing.context,mode:"recall"}}:{decision:"silent",reasonCode:"unknown_face"})));
  await signInDemo(page,"/wearer",false,undefined,"Rosa");
  await page.getByRole("button",{name:"Who is this?"}).click();
  await expect(page.getByRole("heading",{name:"Nora",exact:true})).toBeVisible();
  await expect(page.getByText("Your sister",{exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/recall-375.png",fullPage:true});
  await page.getByText("Why this?",{exact:true}).click();
  await expect(page.getByText(/Kin recognized Nora/)).toBeVisible();
  await page.getByRole("button",{name:"Who is this?"}).click();
  await expect(page.getByRole("heading",{name:"Nora",exact:true})).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("enough clear evidence");
});

test("Today distinguishes a recorded camera match from an interaction and adds no memories",async({page})=>{
  await page.setViewportSize({width:375,height:900});
  let mutations=0;
  page.on("request",request=>{if(new URL(request.url()).pathname.startsWith("/api/")&&request.method()!=="GET")mutations++;});
  await page.route("**/rest/v1/recall_events?**",route=>route.fulfill(json([
    {id:"event",family_id:DEMO_FAMILY_ID,status:"silent",created_at:new Date().toISOString(),face_outcome:{status:"matched",subjectNodeId:nora.id}},
    {id:"unknown",family_id:DEMO_FAMILY_ID,status:"silent",created_at:new Date().toISOString(),face_outcome:{status:"unknown"}},
  ])));
  await signInDemo(page,"/today",false,undefined,"Rosa");
  await expect(page.getByRole("heading",{name:"A camera check matched Nora."})).toBeVisible();
  await expect(page.getByText(/doesn’t confirm that you met/)).toBeVisible();
  await expect(page.getByText(/Kin stayed quiet/)).toBeVisible();
  await expect(page.locator("ol > li")).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(mutations).toBe(0);
});

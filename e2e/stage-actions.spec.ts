import { test, expect, familyFixture } from './fixtures';
import type { Page } from '@playwright/test';
const seed=(page:Page)=>page.getByRole('button',{name:/^(Add sample memories|Adding…)$/});
const reset=(page:Page)=>page.getByRole('button',{name:'Reset family memories',exact:true});
test.beforeEach(async({page})=>{
  await page.route('**/api/self/**',r=>r.fulfill({status:403,json:{error:'No self keeper'}}));
  await page.route('**/api/family',r=>r.fulfill({json:familyFixture()}));
});
async function tools(page:Page){await page.goto('/settings');await page.getByText('Demo tools',{exact:true}).click()}
test('sample-data failure preserves controls and retry succeeds',async({page})=>{
 let calls=0;await page.route('**/api/admin/seed',r=>r.fulfill(++calls===1?{status:500,json:{error:'Seed unavailable'}}:{json:{ok:true}}));
 await tools(page);await seed(page).click();await expect(page.locator('p[role=alert]')).toContainText('Seed unavailable');
 await seed(page).click();await expect(page.getByRole('status')).toContainText('Sample memories added.');expect(calls).toBe(2);
});
test('non-JSON failure shows a readable error',async({page})=>{
 await page.route('**/api/admin/seed',r=>r.fulfill({status:502,contentType:'text/html',body:'<html>Bad Gateway</html>'}));
 await tools(page);await seed(page).click();await expect(page.locator('p[role=alert]')).toContainText('Request failed (502)');await expect(seed(page)).toBeEnabled();
});
test('network failure restores controls without a page error',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/admin/seed',r=>r.abort());
 await tools(page);await seed(page).click();await expect(page.locator('p[role=alert]')).toBeVisible();await expect(seed(page)).toBeEnabled();expect(errors).toEqual([]);
});
test('pending organizer action prevents duplicate submissions',async({page})=>{
 let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/admin/seed',async r=>{calls++;await gate;await r.fulfill({json:{ok:true}})});
 await tools(page);try{await seed(page).click();await expect.poll(()=>calls).toBe(1);await expect(seed(page)).toBeDisabled();await expect(reset(page)).toBeDisabled();await seed(page).dispatchEvent('click');expect(calls).toBe(1)}finally{release()}
 await expect(seed(page)).toBeEnabled();
});
test('reset requires explicit confirmation and preserves accounts in its explanation',async({page})=>{
 let calls=0;await page.route('**/api/admin/reset',r=>{calls++;return r.fulfill({json:{ok:true}})});
 await tools(page);await reset(page).click();await expect(page.getByRole('dialog')).toContainText('Their accounts remain connected');expect(calls).toBe(0);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(calls).toBe(0);
 await reset(page).click();await page.getByRole('button',{name:'Clear all family memories',exact:true}).click();await expect(page.getByRole('status')).toContainText('Accounts are still connected');expect(calls).toBe(1);
});
for(const result of ['failure','empty','success'] as const) test(`replay handles ${result} without losing its last-known-person contract`,async({page})=>{
 const data=familyFixture();data.events=[{id:'known',family_id:data.familyId,status:'speak',gate:null,keeper_results:[],cue_text:'A family memory.',snapshot_path:null,face_descriptors:null,silence_reason:null,latency_ms:1,created_at:new Date().toISOString()}];
 await page.route('**/api/family',r=>r.fulfill({json:data}));let posts=0;
 await page.route('**/api/recall',r=>{if(r.request().method()==='GET')return r.fulfill(result==='failure'?{status:500,json:{error:'Recall unavailable'}}:{json:{lastEventId:result==='empty'?null:'known'}});posts++;expect(r.request().postDataJSON()).toEqual({replayEventId:'known'});return r.fulfill({json:{decision:'silent'}})});
 await page.goto('/stage');await page.getByRole('button',{name:'Listen again',exact:true}).click();
 if(result==='success'){await expect(page.getByRole('status')).toContainText('Kin stayed quiet');expect(posts).toBe(1)}else{await expect(page.locator('p[role=alert]')).toContainText(result==='failure'?'Recall unavailable':'Recognize someone first');expect(posts).toBe(0)}
});

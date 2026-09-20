import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const { requireFamily } = vi.hoisted(() => ({ requireFamily: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireFamily }));
import { authenticateAdmin, authenticateFamily, authenticateIngestion } from "@/lib/ingestion/auth";
const request = () => new Request("http://localhost/api/recall");
const contributor = { id:"relative", family_id:"family", is_self:false };
function database(row: unknown = contributor) {
  const filters: Record<string, unknown> = {};
  const q = { select:()=>q, eq:(k:string,v:unknown)=>{filters[k]=v;return q}, single:async()=>({data:row,error:null}), maybeSingle:async()=>({data:row,error:null}) };
  const getUser=vi.fn().mockResolvedValue({data:{user:null},error:new Error("Invalid bearer")});
  return {sb:{from:()=>q,auth:{getUser}} as unknown as SupabaseClient,filters,getUser};
}
beforeEach(()=>{vi.clearAllMocks();requireFamily.mockResolvedValue({user:{id:"user"},familyId:"family",relativeId:"relative",role:"contributor",isOwner:true})});
it("uses verified cookie membership for an organizer's existing ingestion API",async()=>{
  const {sb,filters}=database();
  expect(await authenticateAdmin(request(),sb)).toMatchObject({userId:"user",familyId:"family",contributorId:"relative",isAdmin:true});
  expect(filters).toEqual({id:"relative",family_id:"family"});
});
it("does not grant organizer controls to an ordinary cookie member",async()=>{
  requireFamily.mockResolvedValue({user:{id:"user"},familyId:"family",relativeId:"relative",role:"contributor",isOwner:false});
  await expect(authenticateAdmin(request(),database().sb)).rejects.toMatchObject({status:403});
});
it("lets a loved one recall without a self keeper but denies contribution",async()=>{
  requireFamily.mockResolvedValue({user:{id:"user"},familyId:"family",relativeId:null,role:"loved_one",isOwner:true});
  expect(await authenticateFamily(request(),database(null).sb)).toMatchObject({contributorId:null,isSelf:true,isAdmin:false});
  await expect(authenticateIngestion(request(),database(null).sb)).rejects.toMatchObject({status:403});
});
it("scopes a loved one's own recording to the family self keeper",async()=>{
  requireFamily.mockResolvedValue({user:{id:"user"},familyId:"family",relativeId:null,role:"loved_one",isOwner:false});
  const {sb,filters}=database({...contributor,id:"self",is_self:true});
  expect(await authenticateIngestion(request(),sb)).toMatchObject({contributorId:"self",isAdmin:false,isSelf:true});
  expect(filters).toEqual({family_id:"family",is_self:true});
});
it("rejects missing or incomplete cookie membership",async()=>{
  for(const status of [401,409]){
    requireFamily.mockRejectedValue(Object.assign(new Error("Denied"),{status}));
    await expect(authenticateFamily(request(),database().sb)).rejects.toMatchObject({status:status===409?403:status});
  }
});
it("never falls back to cookies when an explicit bearer token is invalid",async()=>{
  await expect(authenticateFamily(new Request("http://localhost/api/recall",{headers:{authorization:"Bearer invalid"}}),database().sb)).rejects.toMatchObject({status:401});
  expect(requireFamily).not.toHaveBeenCalled();
});

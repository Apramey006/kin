import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteMemory } from "@/lib/delete-memory";
// A query double records scope and mutations; PostgreSQL cascade behavior is
// covered separately by the local database checks.
function database(owned = true, storageFails = false) {
  const reads: Record<string,unknown[]> = {
    memories:owned?[{id:'memory',media_path:'family/photo.jpg'}]:[],
    provenance:[{memory_id:'memory',node_id:'shared',edge_id:null},{memory_id:'other',node_id:'shared',edge_id:null}],
    graph_nodes:[{id:'shared',relation_to_wearer:'sister'}],graph_edges:[],
    face_embeddings:[{id:'face',person_node_id:'shared',memory_id:'memory'},{id:'other-face',person_node_id:'shared',memory_id:'other'}],
    weaver_questions:[],recall_events:[{id:'event',evidence:[{memoryId:'memory'}],gate:null,keeper_results:[]}],
  };
  const writes: {table:string;operation:string;value?:unknown;filters:Record<string,unknown>}[]=[];
  const storage: string[][]=[];
  const sb={from:(table:string)=>{
    let operation='select',value:unknown;const filters:Record<string,unknown>={};
    const result=()=>{if(operation!=='select')writes.push({table,operation,value,filters});return {data:reads[table]??[],error:null}};
    const q={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q},in:(k:string,v:unknown)=>{filters[k]=v;return q},
      delete:()=>{operation='delete';return q},update:(v:unknown)=>{operation='update';value=v;return q},
      maybeSingle:async()=>({data:owned?reads[table][0]:null,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
    return q;
  },storage:{from:()=>({remove:async(paths:string[])=>{storage.push(paths);return {error:storageFails?new Error('Storage unavailable'):null}}})}} as unknown as SupabaseClient;
  return {sb,writes,storage};
}
it('removes retry receipts and invalidates main recall evidence while retaining shared facts',async()=>{
 const {sb,writes,storage}=database();expect(await deleteMemory(sb,'family','relative','memory')).toBe(true);
 expect(storage).toEqual([['family/photo.jpg']]);
 expect(writes.find(w=>w.table==='recall_events')).toMatchObject({operation:'update',value:{status:'silent',cue_text:null,evidence:[],selected_fact_ids:[]},filters:{family_id:'family',id:['event']}});
 expect(writes.find(w=>w.table==='ingestion_receipts')).toMatchObject({operation:'delete',filters:{family_id:'family',contributor_id:'relative',id:['memory','face']}});
 expect(writes.some(w=>w.table==='graph_nodes')).toBe(false);
 expect(writes.at(-1)).toMatchObject({table:'memories',filters:{family_id:'family',contributor_id:'relative',id:'memory'}});
});
it('does not mutate another contributor’s memory',async()=>{
 const {sb,writes,storage}=database(false);expect(await deleteMemory(sb,'family','relative','foreign')).toBe(false);expect(writes).toEqual([]);expect(storage).toEqual([]);
});
it('keeps the contribution retryable when storage removal fails',async()=>{
 const {sb,writes}=database(true,true);await expect(deleteMemory(sb,'family','relative','memory')).rejects.toThrow('Storage unavailable');expect(writes).toEqual([]);
});

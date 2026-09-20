import { expect, it } from "vitest";
import { recordedMatches, type RecordedCheck } from "../lib/reflection";
import type { GraphNodeRow } from "../lib/types";
const person:GraphNodeRow={id:"nora",family_id:"f",label:"Nora",type:"person",relation_to_wearer:"sister",aliases:[]};
const from=new Date("2026-09-20T04:00:00Z"),to=new Date("2026-09-21T04:00:00Z");
const event:RecordedCheck={id:"e",family_id:"f",status:"silent",created_at:"2026-09-20T05:00:00Z",face_outcome:{status:"matched",subjectNodeId:"nora",model:"test",enrollmentIds:[],distance:.3,v:1}};
it("reports a recorded camera match without inventing an interaction or memory",()=>{
  expect(recordedMatches("f",from,to,[event],[person])).toEqual([{id:"e",at:event.created_at,person,cueAvailable:false}]);
});
it("excludes unknown faces, running checks, other families and out-of-day timestamps",()=>{
  for(const e of [{...event,status:"running"},{...event,family_id:"other"},{...event,created_at:"2026-09-20T03:59:59Z"},
    {...event,created_at:to.toISOString()},{...event,created_at:"invalid"},{...event,face_outcome:null},
    {...event,face_outcome:{status:"unknown" as const,model:"test"}}]) expect(recordedMatches("f",from,to,[e],[person])).toEqual([]);
  expect(recordedMatches("f",from,to,[event],[{...person,family_id:"other"}])).toEqual([]);
});

import { afterEach, expect, it, vi } from "vitest";
import { playCue, stopCue, unlockAudio } from "@/lib/audio";
afterEach(()=>vi.unstubAllGlobals());
it.each([stopCue,unlockAudio])("cancels an old playback rejection before it can speak stale text",async(stop)=>{
 const speak=vi.fn();vi.stubGlobal('speechSynthesis',{cancel:vi.fn(),speak});
 vi.stubGlobal('SpeechSynthesisUtterance',class {constructor(public text:string){}});
 let reject!: (e:Error)=>void;
 const audio={play:vi.fn().mockReturnValueOnce(new Promise((_,r)=>{reject=r})).mockResolvedValue(undefined),pause:vi.fn(),src:'',onerror:null} as unknown as HTMLAudioElement;
 playCue(audio,{cueText:'Old cue',audio:'AA=='});stop(audio);reject(new Error('interrupted'));await Promise.resolve();
 expect(speak).not.toHaveBeenCalled();
});

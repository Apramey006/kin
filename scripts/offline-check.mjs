import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const commands = {
  test: ['node_modules/vitest/vitest.mjs','run'],
  lint: ['node_modules/next/dist/bin/next','lint'],
  build: ['node_modules/next/dist/bin/next','build'],
  types: ['node_modules/typescript/bin/tsc','--noEmit'],
  browser: ['node_modules/@playwright/test/cli.js','test','--config=playwright.offline.config.ts'],
  serve: ['node_modules/next/dist/bin/next','dev','-p','3197'],
};
const command = commands[process.argv[2]];
if (!command) throw new Error('Choose test, lint, build, types, browser or serve');
// Empty values prevent Next's env loader from restoring local credentials.
// The .invalid origin is only for intercepted browser Auth fixtures, never a DB.
const env = {...process.env, NEXT_PUBLIC_SUPABASE_URL:'https://kin-offline.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'offline-fixture-only', NEXT_PUBLIC_SUPABASE_ANON_KEY:'',
  SUPABASE_SECRET_KEY:'', SUPABASE_SERVICE_ROLE_KEY:'', OPENAI_API_KEY:'', DEEPGRAM_API_KEY:'',
  ELEVENLABS_API_KEY:'', KIN_FACE_SERVICE_URL:'', KIN_FACE_SERVICE_TOKEN:'', KIN_FACE_TOKEN_KEY:'',
  NEXT_TELEMETRY_DISABLED:'1',
  NODE_OPTIONS:`${process.env.NODE_OPTIONS || ''} --require "${fileURLToPath(new URL('./offline-network.cjs',import.meta.url)).replaceAll('\\','/')}"`,
};
const child=spawn(process.execPath,[...command,...process.argv.slice(3)],{env,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});
child.on('error',()=>{console.error('Offline command could not start');process.exitCode=1;});

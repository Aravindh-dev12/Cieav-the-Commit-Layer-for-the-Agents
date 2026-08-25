import {spawn} from "node:child_process";
import {access} from "node:fs/promises";
import path from "node:path";

const SECRET_ENV_KEYS=[
  "CIEAV_BROWSER_CONTROL_TOKEN","LATCH_BROWSER_CONTROL_TOKEN",
  "CIEAV_BROWSER_OBSERVATION_TOKEN","CIEAV_BROWSER_COMMIT_TOKEN","CIEAV_BROWSER_REPLAY_KEY",
  "CIEAV_GATEWAY_TOKEN","LATCH_GATEWAY_TOKEN",
  "CIEAV_AUDIT_INTEGRITY_KEY","LATCH_AUDIT_INTEGRITY_KEY",
  "JWT_SECRET","RECEIPT_SIGNING_SECRET",
  "HF_TOKEN","HUGGING_FACE_HUB_TOKEN","OPENAI_API_KEY"
];

async function exists(file){try{await access(file);return true}catch{return false}}

export function chromiumEnvironment(source=process.env){
  const clean={...source};
  for(const key of SECRET_ENV_KEYS)delete clean[key];
  delete clean.CIEAV_DEBUG_PORT;delete clean.LATCH_DEBUG_PORT;
  return clean;
}

export function chromiumArgs({profile,headless=false,testMode=false}={}){
  if(!profile)throw new Error("Chromium profile path is required");
  return [
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble",
    "--no-proxy-server",
    ...(headless?["--headless=new","--disable-gpu",...(testMode?["--no-sandbox","--enable-automation"]:[])]:[]),
    "about:blank"
  ];
}

export async function launchChromiumPrivate({bin,profile,headless=false,testMode=false,sourceEnv=process.env,here}={}){
  if(!bin)throw new Error("Chromium executable is required");
  if(!here)throw new Error("Browser runtime directory is required");
  const args=chromiumArgs({profile,headless,testMode}),env=chromiumEnvironment(sourceEnv);
  if(process.platform==="win32"){
    const bridge=process.env.CIEAV_CDP_WIN_BRIDGE??process.env.LATCH_CDP_WIN_BRIDGE??path.join(here,"cdp-win-bridge.exe");
    if(!await exists(bridge))throw new Error(`CIEAV Windows CDP bridge is missing: ${bridge}`);
    const child=spawn(bridge,["--chrome",bin,"--",...args],{stdio:["pipe","pipe","inherit"],env,windowsHide:true});
    if(!child.stdin||!child.stdout){try{child.kill()}catch{}throw new Error("CIEAV Windows CDP bridge did not expose private streams")}
    return {browser:child,readable:child.stdout,writable:child.stdin,transport:"private-windows-handle-pipe"};
  }
  const child=spawn(bin,["--remote-debugging-pipe",...args],{stdio:["ignore",headless?"ignore":"inherit",headless?"ignore":"inherit","pipe","pipe"],env});
  if(!child.stdio[3]||!child.stdio[4]){try{child.kill()}catch{}throw new Error("Chromium private debugging pipes were not created")}
  return {browser:child,readable:child.stdio[4],writable:child.stdio[3],transport:"private-posix-fd-pipe"};
}

export const ChromiumLaunchConstants={SECRET_ENV_KEYS};
#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>readFile(path.join(ROOT,relative),"utf8");
const must=(source,token,label)=>{if(!source.includes(token))throw new Error(`${label}: missing ${token}`)};
const mustNot=(source,token,label)=>{if(source.includes(token))throw new Error(`${label}: forbidden ${token}`)};

const adapter=await read("apps/api/src/trusted-desktop-adapter.ts");
for(const token of ["CIEAV_DESKTOP_COMMIT_V1","CIEAV_DESKTOP_COMMIT_KEY","createHmac(\"sha256\"","commitKeyEnv:EnvName","runHelper(h.observe,observeEnvelope(c),c)","runHelper(h.exec,envelope,c,key)"])must(adapter,token,"desktop adapter");
mustNot(adapter,"shell:true","desktop adapter");

const surfaces=[
  {name:"windows",observe:"native/windows/cieav-desktop-observe/Program.cs",invoke:"native/windows/cieav-desktop-invoke/Program.cs",build:"scripts/build-windows-desktop-helpers.mjs",mutation:"InvokePattern.Invoke()",auth:"HMACSHA256"},
  {name:"macos",observe:"native/macos/cieav-desktop-observe/main.swift",invoke:"native/macos/cieav-desktop-invoke/main.swift",build:"scripts/build-macos-desktop-helpers.mjs",mutation:"AXUIElementPerformAction(resolved.2, kAXPressAction",auth:"HMAC<SHA256>.authenticationCode"},
  {name:"linux",observe:"native/linux/cieav-desktop-observe/main.c",invoke:"native/linux/cieav-desktop-invoke/main.c",build:"scripts/build-linux-desktop-helpers.mjs",mutation:"atspi_action_do_action(action,0",auth:"g_compute_hmac_for_data"}
];
for(const s of surfaces){
  const observe=await read(s.observe),invoke=await read(s.invoke),build=await read(s.build);
  mustNot(observe,"CIEAV_DESKTOP_COMMIT_KEY",`${s.name} observer`);
  mustNot(observe,s.mutation,`${s.name} observer`);
  must(invoke,"CIEAV_DESKTOP_COMMIT_KEY",`${s.name} executor`);
  must(invoke,"CIEAV_DESKTOP_COMMIT_V1",`${s.name} executor`);
  must(invoke,s.auth,`${s.name} executor`);
  must(invoke,s.mutation,`${s.name} executor`);
  must(invoke,"PRESTATE_MISMATCH",`${s.name} executor`);
  must(build,s.observe,`${s.name} build recipe`);
  must(build,s.invoke,`${s.name} build recipe`);
  must(build,"sha256",`${s.name} build recipe`);
}

const linuxBuild=await read("scripts/build-linux-desktop-helpers.mjs");for(const token of ["atspi-2","json-glib-1.0","-fstack-protector-strong","-Wl,-z,relro,-z,now"])must(linuxBuild,token,"linux build hardening");
const windowsBuild=await read("scripts/build-windows-desktop-helpers.mjs");for(const token of ["dotnet","publish","--runtime","win-x64","-p:ContinuousIntegrationBuild=true"])must(windowsBuild,token,"windows build reproducibility");
const macBuild=await read("scripts/build-macos-desktop-helpers.mjs");for(const token of ["xcrun","swiftc","-whole-module-optimization","ApplicationServices","CryptoKit"])must(macBuild,token,"macOS build reproducibility");
console.log(JSON.stringify({ok:true,gate:"desktop-native-static",platforms:surfaces.map(s=>s.name)}));

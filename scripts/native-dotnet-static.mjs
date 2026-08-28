#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const failures=[];
function need(file,...tokens){const p=path.join(root,file);if(!fs.existsSync(p)){failures.push(`${file}: missing`);return}const text=fs.readFileSync(p,"utf8");for(const token of tokens)if(!text.includes(token))failures.push(`${file}: missing ${token}`)}
function reject(file,...tokens){const text=fs.readFileSync(path.join(root,file),"utf8");for(const token of tokens)if(text.includes(token))failures.push(`${file}: forbidden ${token}`)}

need("native/include/cieav_native.h","CIEAV_NATIVE_ABI_VERSION 1u","cieav_native_health","cieav_native_platform_snapshot","cieav_native_secure_zero","extern \"C\"");
need("native/c/cieav_native.c","authority = 0u","may_mint_execution_authority = 0u","execution_authority_issued = 0u","CIEAV_NATIVE_E_BUFFER_TOO_SMALL");
need("native/c/cieav_native_test.c","zero-authority invariant failed","snapshot sizing contract failed","secure zero failed");
need("native/cpp/cieav_native_smoke.cpp","CIEAV C++/C ABI smoke PASS","execution_authority_issued");
need("native/CMakeLists.txt","C_STANDARD 17","CXX_STANDARD 20","-Werror","/WX","add_test");
need("dotnet/Cieav.Platform/Cieav.Platform.csproj","net10.0","TreatWarningsAsErrors","Deterministic");
need("dotnet/Cieav.Platform/Program.cs","NamedPipeServerStream","PipeOptions.CurrentUserOnly","HMACSHA256","FixedTimeEquals","replayed_nonce","operation_not_allowed","authority = false","mayMintExecutionAuthority = false","executionAuthorityIssued = false");
need("dotnet/Cieav.Platform/NativeBridge.cs","NativeLibrary.Load","native_abi_version_mismatch","native_health_claimed_authority","CIEAV_NATIVE_LIBRARY");
reject("dotnet/Cieav.Platform/Program.cs","Process.Start(","cmd.exe","powershell.exe","/bin/sh");
need("scripts/qualify-native-dotnet.mjs","CIEAV_NATIVE_DOTNET_QUALIFICATION_V1","ctest","native-health","CIEAV_NATIVE_LIBRARY","executionAuthorityIssued:false");
need(".github/workflows/native-dotnet-qualification.yml","ubuntu-latest","windows-latest","macos-latest","10.0.x","latest-native-dotnet-qualification.json");
need("package.json","test:native-dotnet:static","release:qualify:native-dotnet");
need(".env.example","CIEAV_DOTNET_IPC_SECRET","CIEAV_DOTNET_PIPE_NAME","CIEAV_NATIVE_LIBRARY");

if(failures.length){console.error("CIEAV native/.NET static gate FAIL");for(const item of failures)console.error(` - ${item}`);process.exit(1)}
console.log("CIEAV native/.NET static gate PASS - C17 stable ABI + C++ consumer + authenticated replay-resistant .NET 10 IPC + native ABI validation + zero authority present");

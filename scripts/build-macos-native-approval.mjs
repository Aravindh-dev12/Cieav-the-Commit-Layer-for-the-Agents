#!/usr/bin/env node
import crypto from "node:crypto";
import {access,chmod,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const SOURCE=path.join(ROOT,"native","macos","cieav-native-approval","main.swift");
const arg=name=>{const prefix=`--${name}=`;const found=process.argv.slice(2).find(value=>value.startsWith(prefix));return found?found.slice(prefix.length):null};
if(process.platform!=="darwin")throw new Error("CIEAV macOS native approval host can only be built on macOS");
const sourceHash=crypto.createHash("sha256").update(await readFile(SOURCE)).digest("hex").slice(0,16),outputRoot=path.resolve(arg("output-dir")||path.join(ROOT,".cieav","native",`cieav-native-approval-macos-${sourceHash}`)),app=path.join(outputRoot,"CIEAVNativeApproval.app"),macosDir=path.join(app,"Contents","MacOS"),exe=path.join(macosDir,"cieav-native-approval"),info=path.join(app,"Contents","Info.plist");
const binaryDigest=async()=>crypto.createHash("sha256").update(await readFile(exe)).digest("hex");
try{await access(exe);console.log(JSON.stringify({ok:true,reused:true,sourceHash,outputDir:outputRoot,app,exe,sha256:await binaryDigest()}));process.exit(0)}catch{}
const swift=spawnSync("xcrun",["--find","swiftc"],{encoding:"utf8"});if(swift.status!==0)throw new Error("Xcode command line tools with swiftc are required");
await rm(outputRoot,{recursive:true,force:true});await mkdir(macosDir,{recursive:true});
const built=spawnSync("xcrun",["swiftc","-O","-whole-module-optimization",SOURCE,"-framework","Foundation","-framework","UserNotifications","-o",exe],{cwd:ROOT,stdio:"inherit"});if(built.status!==0)throw new Error(`CIEAV macOS native approval build failed with exit code ${built.status??"unknown"}`);await chmod(exe,0o755);
const plist=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.cieav.nativeapproval</string><key>CFBundleName</key><string>CIEAV Native Approval</string><key>CFBundleDisplayName</key><string>CIEAV</string><key>CFBundleExecutable</key><string>cieav-native-approval</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>1.0</string><key>LSUIElement</key><true/><key>NSHighResolutionCapable</key><true/></dict></plist>\n`;await writeFile(info,plist,"utf8");await access(exe);console.log(JSON.stringify({ok:true,reused:false,sourceHash,outputDir:outputRoot,app,exe,sha256:await binaryDigest()}));

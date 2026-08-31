import {existsSync,readFileSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import path from "node:path";

const run=(root,exe,args,opts={})=>spawnSync(exe,args,{cwd:root,encoding:"utf8",shell:false,...opts});

export const describeWindowsNativeRun=(result)=>[
  `exit=${result.status??"not-started"}`,
  result.signal?`signal=${result.signal}`:"",
  result.error?`spawn=${result.error.code??result.error.name}:${result.error.message}`:"",
  String(result.stdout??"").trim()?`stdout=${String(result.stdout).trim()}`:"",
  String(result.stderr??"").trim()?`stderr=${String(result.stderr).trim()}`:""
].filter(Boolean).join(" · ");

const configuredTool=(name,fallback,fail)=>{
  const value=String(process.env[name]??"").trim();
  if(!value)return fallback;
  const resolved=path.resolve(value);
  if(!existsSync(resolved))fail(`${name} does not exist: ${resolved}`);
  return resolved;
};

const hasVisualCpp=(root)=>{
  const programFilesX86=process.env["ProgramFiles(x86)"]??"C:\\Program Files (x86)";
  const vswhere=path.join(programFilesX86,"Microsoft Visual Studio/Installer/vswhere.exe");
  if(!existsSync(vswhere))return false;
  const found=run(root,vswhere,["-latest","-products","*","-requires","Microsoft.VisualStudio.Component.VC.Tools.x86.x64","-property","installationPath"]);
  return found.status===0&&Boolean(String(found.stdout??"").trim());
};

export const assertWindowsPeHardening=(file,msvc,fail,label="native executable")=>{
  let bytes,pe,optional,dll;
  try{
    bytes=readFileSync(file);
    pe=bytes.readUInt32LE(0x3c);
    if(bytes.toString("ascii",pe,pe+4)!=="PE\0\0")throw new Error("signature");
    optional=pe+24;
    if(bytes.readUInt16LE(optional)!==0x20b)throw new Error("PE32+");
    dll=bytes.readUInt16LE(optional+0x46);
  }catch{
    fail(`${label} is not a valid PE32+ executable`);
  }
  const required=0x20|0x40|0x100;
  if((dll&required)!==required)fail(`${label} lacks HIGH_ENTROPY_VA/DYNAMIC_BASE/NX_COMPAT protections: 0x${dll.toString(16)}`);
  if(msvc&&!(dll&0x4000))fail(`${label} lacks Guard CF metadata`);
  if(!msvc&&!bytes.includes(Buffer.from([0xf3,0x0f,0x1e,0xfa])))fail(`${label} lacks CET control-flow entry instrumentation`);
};

export const buildWindowsNativeExecutable=({root,sourceDir,buildName,executableName,fail})=>{
  const cmake=configuredTool("CIEAV_CMAKE","cmake",fail);
  const msvc=hasVisualCpp(root);
  const build=path.join(root,`.tmp/${buildName}${msvc?"":"-zig"}`);
  rmSync(build,{recursive:true,force:true});

  let configureArgs=["-S",sourceDir,"-B",build];
  if(msvc){
    configureArgs.push("-A","x64");
  }else{
    const zig=configuredTool("CIEAV_ZIG","",fail);
    const ninja=configuredTool("CIEAV_NINJA","",fail);
    if(!zig||!ninja)fail("Visual C++ Build Tools were not found; portable qualification requires explicit CIEAV_ZIG and CIEAV_NINJA paths");
    configureArgs.push("-G","Ninja",`-DCMAKE_MAKE_PROGRAM=${ninja}`,`-DCMAKE_CXX_COMPILER=${zig}`,"-DCMAKE_CXX_COMPILER_ARG1=c++","-DCMAKE_BUILD_TYPE=Release");
  }

  let result=run(root,cmake,configureArgs);
  if(result.status!==0)fail(`cmake configure failed\n${result.stdout??""}\n${result.stderr??result.error?.message??""}`);
  result=run(root,cmake,["--build",build,"--config","Release","--parallel","2"]);
  if(result.status!==0)fail(`cmake build failed\n${result.stdout??""}\n${result.stderr??result.error?.message??""}`);

  const candidates=[path.join(build,"Release",executableName),path.join(build,executableName)];
  const executable=candidates.find(existsSync);
  if(!executable)fail(`compiled executable not found: ${executableName}`);
  assertWindowsPeHardening(executable,msvc,fail,executableName);
  return {executable,msvc,run:(args,opts={})=>run(root,executable,args,opts)};
};

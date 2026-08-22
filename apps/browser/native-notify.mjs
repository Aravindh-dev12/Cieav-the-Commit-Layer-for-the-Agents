import {spawn} from "node:child_process";

const enabled=()=>!["0","false","off","disabled"].includes(String(process.env.CIEAV_NOTIFICATIONS??"1").trim().toLowerCase());
const clean=(value,max)=>String(value??"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim().slice(0,max);
const minimalEnv=extra=>{
  const env={};
  for(const key of ["SystemRoot","WINDIR","ComSpec","PATH","TEMP","TMP","USERPROFILE","HOME","LANG","LC_ALL","DISPLAY","DBUS_SESSION_BUS_ADDRESS","XDG_RUNTIME_DIR"]){
    if(process.env[key])env[key]=process.env[key];
  }
  return {...env,...extra};
};
const detached=child=>{child.on("error",()=>{});child.unref?.();return true};

export function notifyNative(title,message,{level="info"}={}){
  if(!enabled())return false;
  title=clean(title,80)||"CIEAV";
  message=clean(message,220)||"CIEAV activity";
  level=clean(level,16).toLowerCase();
  try{
    if(process.platform==="win32"){
      const script=[
        "$ErrorActionPreference='SilentlyContinue'",
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        "$n=New-Object System.Windows.Forms.NotifyIcon",
        "$n.Icon=if($env:CIEAV_NOTIFY_LEVEL -eq 'error'){[System.Drawing.SystemIcons]::Error}elseif($env:CIEAV_NOTIFY_LEVEL -eq 'warning'){[System.Drawing.SystemIcons]::Warning}else{[System.Drawing.SystemIcons]::Information}",
        "$n.BalloonTipTitle=$env:CIEAV_NOTIFY_TITLE",
        "$n.BalloonTipText=$env:CIEAV_NOTIFY_MESSAGE",
        "$n.Visible=$true",
        "$n.ShowBalloonTip(3500)",
        "Start-Sleep -Milliseconds 3800",
        "$n.Dispose()"
      ].join(";");
      return detached(spawn("powershell.exe",["-NoProfile","-NonInteractive","-WindowStyle","Hidden","-ExecutionPolicy","Bypass","-Command",script],{
        stdio:"ignore",windowsHide:true,detached:true,
        env:minimalEnv({CIEAV_NOTIFY_TITLE:title,CIEAV_NOTIFY_MESSAGE:message,CIEAV_NOTIFY_LEVEL:level})
      }));
    }
    if(process.platform==="darwin"){
      const script='on run argv\n display notification item 2 of argv with title item 1 of argv\nend run';
      return detached(spawn("osascript",["-e",script,title,message],{stdio:"ignore",detached:true,env:minimalEnv({})}));
    }
    return detached(spawn("notify-send",["--app-name=CIEAV",title,message],{stdio:"ignore",detached:true,env:minimalEnv({})}));
  }catch{return false}
}

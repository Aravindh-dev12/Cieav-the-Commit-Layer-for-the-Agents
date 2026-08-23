import {describe,expect,it} from "vitest";
import {TrustedGitRemoteRefToolConfigSchema} from "./trusted-git-smart-http-adapter.js";

const base={
  toolId:"remote-main",
  repository:"/repo",
  gitDir:"/repo/.git",
  objectDir:"/repo/.git/objects",
  remoteUrl:"https://git.example.com/org/repo.git",
  remoteRef:"refs/heads/main",
  gitBinary:"/usr/bin/git",
  gitBinarySha256:"a".repeat(64)
};

describe("Smart HTTP credential schema",()=>{
  it("keeps BASIC_ENV as a discriminated-union object",()=>{
    const parsed=TrustedGitRemoteRefToolConfigSchema.parse({...base,credential:{kind:"BASIC_ENV",username:"release-bot",env:"CIEAV_GIT_TOKEN"}});
    expect(parsed.credential).toEqual({kind:"BASIC_ENV",username:"release-bot",env:"CIEAV_GIT_TOKEN"});
  });

  it.each(["bad:name","bad\rname","bad\nname","bad\0name"])("rejects unsafe BASIC username %j",username=>{
    expect(()=>TrustedGitRemoteRefToolConfigSchema.parse({...base,credential:{kind:"BASIC_ENV",username,env:"CIEAV_GIT_TOKEN"}})).toThrow();
  });
});

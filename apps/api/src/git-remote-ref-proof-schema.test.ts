import {describe,expect,it} from "vitest";
import {GitRemoteRefProofCredentialSchema} from "./proof-providers/git-remote-ref.js";

describe("remote Git proof credential schema",()=>{
  it("accepts a normal Basic username",()=>{
    expect(GitRemoteRefProofCredentialSchema.parse({kind:"BASIC_ENV",username:"cieav-proof",env:"CIEAV_GIT_READ_TOKEN"})).toEqual({kind:"BASIC_ENV",username:"cieav-proof",env:"CIEAV_GIT_READ_TOKEN"});
  });
  it.each(["user:name","user\rname","user\nname","user\0name"])("rejects unsafe Basic username %j",username=>{
    expect(()=>GitRemoteRefProofCredentialSchema.parse({kind:"BASIC_ENV",username,env:"CIEAV_GIT_READ_TOKEN"})).toThrow();
  });
});

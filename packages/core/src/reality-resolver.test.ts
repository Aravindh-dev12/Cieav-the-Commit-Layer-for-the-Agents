import {describe,expect,it} from "vitest";
import {CanonicalRealityResolverRegistry,BUILTIN_REALITY_RESOLVERS} from "./reality-resolver.js";

const base={version:"CIEAV_CANONICAL_REALITY_RESOLUTION_REQUEST_V1" as const,authorityDomain:"tenant:acme",aliases:[],parentRefs:[],identityEvidenceRefs:["proof:fixture"],context:{},authority:false as const};

describe("CIEAV canonical reality resolver registry",()=>{
  it("resolves MCP and HTTP email routes to the same canonical reality",()=>{
    const registry=new CanonicalRealityResolverRegistry();
    const mcp=registry.resolve("cieav.mail.address.v1","1",{...base,routeNativeIdentity:"mailto:customer@Example.COM",namespace:"mcp",resourceKind:"RESOURCE"});
    const http=registry.resolve("cieav.mail.address.v1","1",{...base,routeNativeIdentity:"customer@example.com",namespace:"http",resourceKind:"RESOURCE"});
    expect(mcp.address.stableId).toBe("mailto:customer@example.com");
    expect(http.address.stableId).toBe(mcp.address.stableId);
    expect(http.canonicalRealityRef).toBe(mcp.canonicalRealityRef);
    expect(mcp.authority).toBe(false);
    expect(mcp.mayMintExecutionAuthority).toBe(false);
  });

  it("normalizes equivalent HTTP resource identities independent of host case, default port and query ordering",()=>{
    const registry=new CanonicalRealityResolverRegistry();
    const a=registry.resolve("cieav.http.resource.v1","1",{...base,routeNativeIdentity:"HTTPS://API.EXAMPLE.COM:443/v1/invoices/42?b=2&a=1#client",namespace:"http",resourceKind:"RESOURCE"});
    const b=registry.resolve("cieav.http.resource.v1","1",{...base,routeNativeIdentity:"https://api.example.com/v1/invoices/42?a=1&b=2",namespace:"mcp",resourceKind:"RESOURCE"});
    expect(a.address.stableId).toBe(b.address.stableId);
    expect(a.canonicalRealityRef).toBe(b.canonicalRealityRef);
  });

  it("resolves GitHub REST-like and CLI Git identities to the same repository ref",()=>{
    const registry=new CanonicalRealityResolverRegistry();
    const http=registry.resolve("cieav.git.ref.v1","1",{...base,routeNativeIdentity:"https://github.com/Acme/Platform.git#refs/heads/main",namespace:"http",resourceKind:"GIT_REF"});
    const cli=registry.resolve("cieav.git.ref.v1","1",{...base,routeNativeIdentity:"git@github.com:Acme/Platform.git#main",namespace:"cli",resourceKind:"GIT_REF"});
    expect(http.address.stableId).toBe("git://github.com/Acme/Platform#refs/heads/main");
    expect(cli.address.stableId).toBe(http.address.stableId);
    expect(cli.canonicalRealityRef).toBe(http.canonicalRealityRef);
  });

  it("normalizes filesystem aliases while rejecting relative paths",()=>{
    const registry=new CanonicalRealityResolverRegistry();
    const a=registry.resolve("cieav.filesystem.path.v1","1",{...base,routeNativeIdentity:"/srv/cieav/./state/../state/kernel.json",namespace:"cli",resourceKind:"FILE"});
    const b=registry.resolve("cieav.filesystem.path.v1","1",{...base,routeNativeIdentity:"file:///srv/cieav/state/kernel.json",namespace:"desktop",resourceKind:"FILE"});
    expect(a.address.stableId).toBe(b.address.stableId);
    expect(a.canonicalRealityRef).toBe(b.canonicalRealityRef);
    expect(()=>registry.resolve("cieav.filesystem.path.v1","1",{...base,routeNativeIdentity:"relative/kernel.json",namespace:"cli",resourceKind:"FILE"})).toThrow("canonical_reality_filesystem_absolute_path_required");
  });

  it("fails closed on resolver manifest tampering and version mismatch",()=>{
    const original=BUILTIN_REALITY_RESOLVERS[0]!;
    expect(()=>new CanonicalRealityResolverRegistry([{...original,manifest:{...original.manifest,resolverVersion:"2"}}])).toThrow("canonical_reality_resolver_manifest_integrity_mismatch");
    const registry=new CanonicalRealityResolverRegistry();
    expect(()=>registry.get("cieav.mail.address.v1","2")).toThrow("canonical_reality_resolver_version_mismatch");
  });
});

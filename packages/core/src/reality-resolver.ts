import crypto from "node:crypto";
import {
  CanonicalRealityResolutionRequestSchema,
  CanonicalRealityResolutionSchema,
  CanonicalRealityResolverManifestSchema,
  type CanonicalRealityResolution,
  type CanonicalRealityResolutionRequest,
  type CanonicalRealityResolverManifest,
  type ExecutionProposal,
  type RealityAddress,
  type TrustedToolAuthorizationBinding
} from "@cieav/contracts";
import {makeRealityAddress} from "./consequence-algebra.js";
import {assertTrustedToolAuthorizationBindingIntegrity} from "./execution-fabric.js";

const canonical=(value:unknown):string=>Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value&&typeof value==="object"
    ? `{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(",")}}`
    : JSON.stringify(value)??"undefined";
export const realityResolverDigest=(value:unknown)=>crypto.createHash("sha256").update(canonical(value)).digest("hex");

export type CanonicalRealityResolver={
  manifest:CanonicalRealityResolverManifest;
  normalize(request:CanonicalRealityResolutionRequest):{namespace:string;resourceKind:string;stableId:string;aliases?:string[];parentRefs?:string[];verificationRefs?:string[]};
};

const manifest=(input:Omit<CanonicalRealityResolverManifest,"manifestDigest">):CanonicalRealityResolverManifest=>
  CanonicalRealityResolverManifestSchema.parse({...input,manifestDigest:realityResolverDigest(input)});

const normalizeEmail=(value:string)=>{
  const raw=value.trim().replace(/^mailto:/i,"");
  const at=raw.lastIndexOf("@");
  if(at<=0||at===raw.length-1)throw new Error("canonical_reality_email_invalid");
  const local=raw.slice(0,at),domain=raw.slice(at+1).toLowerCase();
  return `mailto:${local}@${domain}`;
};

const normalizeHttp=(value:string)=>{
  let url:URL;
  try{url=new URL(value)}catch{throw new Error("canonical_reality_http_invalid")}
  if(!["http:","https:"].includes(url.protocol))throw new Error("canonical_reality_http_scheme_invalid");
  url.hash="";
  url.hostname=url.hostname.toLowerCase();
  if((url.protocol==="http:"&&url.port==="80")||(url.protocol==="https:"&&url.port==="443"))url.port="";
  const entries=[...url.searchParams.entries()].sort(([ak,av],[bk,bv])=>ak.localeCompare(bk)||av.localeCompare(bv));
  url.search="";
  for(const [key,val] of entries)url.searchParams.append(key,val);
  return url.toString();
};

const normalizeFilesystem=(value:string)=>{
  let raw=value.trim().replace(/^file:\/\//i,"").replace(/\\/g,"/");
  const drive=raw.match(/^([A-Za-z]):\//);
  if(drive)raw=`${drive[1]!.toLowerCase()}:${raw.slice(2)}`;
  const absolute=raw.startsWith("/")||/^[a-z]:\//.test(raw);
  if(!absolute)throw new Error("canonical_reality_filesystem_absolute_path_required");
  const prefix=raw.startsWith("/")?"/":"";
  const parts=raw.split("/").filter((part,index)=>part!==""||index===0),stack:string[]=[];
  for(const part of parts){if(part===""||part===".")continue;if(part===".."){if(!stack.length)throw new Error("canonical_reality_filesystem_escape");stack.pop()}else stack.push(part)}
  return `file://${prefix}${stack.join("/")}`;
};

const normalizeGit=(value:string,context:Record<string,string>)=>{
  const explicitRepo=context.repository?.trim(),explicitRef=context.ref?.trim();
  let repository=explicitRepo??"",ref=explicitRef??"";
  if(!repository){
    const hash=value.indexOf("#");repository=(hash>=0?value.slice(0,hash):value).trim();ref=ref||(hash>=0?value.slice(hash+1).trim():"");
  }
  if(!repository||!ref)throw new Error("canonical_reality_git_repository_and_ref_required");
  repository=repository
    .replace(/^git@([^:]+):/i,"$1/")
    .replace(/^ssh:\/\/git@/i,"")
    .replace(/^git\+https?:\/\//i,"")
    .replace(/^https?:\/\//i,"")
    .replace(/^ssh:\/\//i,"")
    .replace(/^git:\/\//i,"")
    .replace(/\.git$/i,"")
    .replace(/\/$/,"");
  const slash=repository.indexOf("/");if(slash<=0)throw new Error("canonical_reality_git_repository_invalid");
  repository=`${repository.slice(0,slash).toLowerCase()}/${repository.slice(slash)}`;
  if(!ref.startsWith("refs/"))ref=`refs/heads/${ref}`;
  return `git://${repository}#${ref}`;
};

const normalizeMessageCustomer=(value:string)=>{
  let url:URL;
  try{url=new URL(value.trim())}catch{throw new Error("canonical_reality_message_customer_invalid")}
  if(url.protocol.toLowerCase()!=="message:"||url.hostname.toLowerCase()!=="customer")throw new Error("canonical_reality_message_customer_invalid");
  url.hash="";
  return `message://customer${url.pathname}${url.search}`;
};

export const BUILTIN_REALITY_RESOLVERS:CanonicalRealityResolver[]=[
  {
    manifest:manifest({version:"CIEAV_CANONICAL_REALITY_RESOLVER_MANIFEST_V1",id:"cieav.mail.address.v1",resolverVersion:"1",supportedNamespaces:["email","mailto","mcp","http"],supportedResourceKinds:["EMAIL_ADDRESS","RESOURCE"],normalizationClass:"EMAIL_ADDRESS",authority:false,mayMintExecutionAuthority:false}),
    normalize:req=>({namespace:"email",resourceKind:"EMAIL_ADDRESS",stableId:normalizeEmail(req.context.canonicalIdentity??req.routeNativeIdentity),aliases:req.aliases,verificationRefs:[...req.identityEvidenceRefs]})
  },
  {
    manifest:manifest({version:"CIEAV_CANONICAL_REALITY_RESOLVER_MANIFEST_V1",id:"cieav.message.customer.v1",resolverVersion:"1",supportedNamespaces:["mcp","http","browser","sdk","cli"],supportedResourceKinds:["RESOURCE"],normalizationClass:"OPAQUE_RESOURCE",authority:false,mayMintExecutionAuthority:false}),
    normalize:req=>({namespace:"message",resourceKind:"RESOURCE",stableId:req.context.canonicalIdentity??normalizeMessageCustomer(req.routeNativeIdentity),aliases:req.aliases,verificationRefs:[...req.identityEvidenceRefs]})
  },
  {
    manifest:manifest({version:"CIEAV_CANONICAL_REALITY_RESOLVER_MANIFEST_V1",id:"cieav.http.resource.v1",resolverVersion:"1",supportedNamespaces:["http","https","rest","mcp"],supportedResourceKinds:["HTTP_RESOURCE","RESOURCE"],normalizationClass:"HTTP_RESOURCE",authority:false,mayMintExecutionAuthority:false}),
    normalize:req=>({namespace:"http-resource",resourceKind:"HTTP_RESOURCE",stableId:req.context.canonicalIdentity??normalizeHttp(req.routeNativeIdentity),aliases:req.aliases,verificationRefs:[...req.identityEvidenceRefs]})
  },
  {
    manifest:manifest({version:"CIEAV_CANONICAL_REALITY_RESOLVER_MANIFEST_V1",id:"cieav.filesystem.path.v1",resolverVersion:"1",supportedNamespaces:["file","filesystem","cli","desktop"],supportedResourceKinds:["FILE","DIRECTORY","RESOURCE"],normalizationClass:"FILESYSTEM_PATH",authority:false,mayMintExecutionAuthority:false}),
    normalize:req=>({namespace:"filesystem",resourceKind:req.resourceKind==="DIRECTORY"?"DIRECTORY":"FILE",stableId:req.context.canonicalIdentity??normalizeFilesystem(req.routeNativeIdentity),aliases:req.aliases,verificationRefs:[...req.identityEvidenceRefs]})
  },
  {
    manifest:manifest({version:"CIEAV_CANONICAL_REALITY_RESOLVER_MANIFEST_V1",id:"cieav.git.ref.v1",resolverVersion:"1",supportedNamespaces:["git","github","gitlab","http","mcp","cli"],supportedResourceKinds:["GIT_REF","RESOURCE"],normalizationClass:"GIT_REF",authority:false,mayMintExecutionAuthority:false}),
    normalize:req=>({namespace:"git",resourceKind:"GIT_REF",stableId:req.context.canonicalIdentity??normalizeGit(req.routeNativeIdentity,req.context),aliases:req.aliases,verificationRefs:[...req.identityEvidenceRefs]})
  },
  {
    manifest:manifest({version:"CIEAV_CANONICAL_REALITY_RESOLVER_MANIFEST_V1",id:"cieav.opaque.resource.v1",resolverVersion:"1",supportedNamespaces:["opaque","mcp","http","browser","sdk","cli","desktop"],supportedResourceKinds:["RESOURCE"],normalizationClass:"OPAQUE_RESOURCE",authority:false,mayMintExecutionAuthority:false}),
    normalize:req=>({namespace:"opaque",resourceKind:"RESOURCE",stableId:req.context.canonicalIdentity??req.routeNativeIdentity.trim(),aliases:req.aliases,verificationRefs:[...req.identityEvidenceRefs]})
  }
];

export class CanonicalRealityResolverRegistry{
  private readonly byId=new Map<string,CanonicalRealityResolver>();
  constructor(resolvers:CanonicalRealityResolver[]=BUILTIN_REALITY_RESOLVERS){for(const resolver of resolvers)this.register(resolver)}
  register(resolver:CanonicalRealityResolver){
    const parsed=CanonicalRealityResolverManifestSchema.parse(resolver.manifest),{manifestDigest,...unsigned}=parsed;
    if(realityResolverDigest(unsigned)!==manifestDigest)throw new Error("canonical_reality_resolver_manifest_integrity_mismatch");
    if(this.byId.has(parsed.id))throw new Error(`canonical_reality_resolver_duplicate:${parsed.id}`);
    this.byId.set(parsed.id,{manifest:parsed,normalize:resolver.normalize});return parsed;
  }
  list(){return [...this.byId.values()].map(x=>x.manifest).sort((a,b)=>a.id.localeCompare(b.id))}
  get(id:string,version?:string){const resolver=this.byId.get(id);if(!resolver)throw new Error(`canonical_reality_resolver_not_found:${id}`);if(version&&resolver.manifest.resolverVersion!==version)throw new Error(`canonical_reality_resolver_version_mismatch:${id}:${version}`);return resolver}
  resolve(id:string,version:string,raw:unknown):CanonicalRealityResolution{
    const resolver=this.get(id,version),request=CanonicalRealityResolutionRequestSchema.parse(raw),namespace=request.namespace.toLowerCase();
    if(!resolver.manifest.supportedNamespaces.includes(namespace))throw new Error(`canonical_reality_resolver_namespace_unsupported:${request.namespace}`);
    if(!resolver.manifest.supportedResourceKinds.includes(request.resourceKind))throw new Error(`canonical_reality_resolver_resource_kind_unsupported:${request.resourceKind}`);
    const normalized=resolver.normalize(request),aliases=[...new Set([request.routeNativeIdentity,...request.aliases,...(normalized.aliases??[])].filter(Boolean))].sort();
    const address:RealityAddress=makeRealityAddress({version:"CIEAV_REALITY_ADDRESS_V1",namespace:normalized.namespace,authorityDomain:request.authorityDomain,resourceKind:normalized.resourceKind,stableId:normalized.stableId,aliases,parentRefs:normalized.parentRefs??request.parentRefs,identityEvidenceRefs:[...new Set([...(normalized.verificationRefs??[]),...request.identityEvidenceRefs])].sort(),resolverId:resolver.manifest.id,resolverVersion:resolver.manifest.resolverVersion});
    const requestDigest=realityResolverDigest(request),canonicalRealityRef=realityResolverDigest({version:"CIEAV_CANONICAL_REALITY_REF_V1",authorityDomain:address.authorityDomain,resourceKind:address.resourceKind,stableId:address.stableId}),verificationRefs=[...new Set(address.identityEvidenceRefs)].sort();
    const unsigned={version:"CIEAV_CANONICAL_REALITY_RESOLUTION_V1" as const,requestDigest,resolverManifestDigest:resolver.manifest.manifestDigest,address,canonicalRealityRef,verificationRefs,authority:false as const,mayMintExecutionAuthority:false as const};
    return CanonicalRealityResolutionSchema.parse({...unsigned,resolutionDigest:realityResolverDigest(unsigned)});
  }
}

export function verifyCanonicalRealityResolution(raw:CanonicalRealityResolution):boolean{
  const resolution=CanonicalRealityResolutionSchema.parse(raw),{addressDigest,...addressUnsigned}=resolution.address;
  if(makeRealityAddress(addressUnsigned).addressDigest!==addressDigest)return false;
  const expectedRef=realityResolverDigest({version:"CIEAV_CANONICAL_REALITY_REF_V1",authorityDomain:resolution.address.authorityDomain,resourceKind:resolution.address.resourceKind,stableId:resolution.address.stableId});
  if(expectedRef!==resolution.canonicalRealityRef)return false;
  const {resolutionDigest,...unsigned}=resolution;
  return realityResolverDigest(unsigned)===resolutionDigest&&resolution.authority===false&&resolution.mayMintExecutionAuthority===false;
}

const resourceKindFor=(manifest:CanonicalRealityResolverManifest)=>manifest.normalizationClass==="GIT_REF"?"GIT_REF":"RESOURCE";

export function resolveExecutionProposalReality(
  proposal:ExecutionProposal,
  rawBinding:TrustedToolAuthorizationBinding,
  registry:CanonicalRealityResolverRegistry=defaultCanonicalRealityResolverRegistry()
):CanonicalRealityResolution{
  const binding=assertTrustedToolAuthorizationBindingIntegrity(rawBinding);
  if(binding.toolId!==proposal.toolId||binding.protocol!==proposal.protocol||binding.operation!==proposal.operation)throw new Error("canonical_reality_execution_binding_mismatch");
  const resolverId=binding.canonicalResolverId??"cieav.opaque.resource.v1",resolverVersion=binding.canonicalResolverVersion??"1",resolver=registry.get(resolverId,resolverVersion);
  const routeNativeIdentity=binding.canonicalTarget??proposal.target??proposal.semanticEffect.target??proposal.semanticEffect.objectRef;
  if(!routeNativeIdentity)throw new Error("canonical_reality_route_identity_required");
  const aliases=[proposal.target,proposal.semanticEffect.target,proposal.semanticEffect.objectRef].filter((value):value is string=>Boolean(value&&value!==routeNativeIdentity));
  const identityEvidenceRefs=[`reality-witness:${proposal.realityWitness.digest}`,...proposal.realityWitness.facts.map(fact=>`source:${fact.source}`)];
  return registry.resolve(resolverId,resolverVersion,{
    version:"CIEAV_CANONICAL_REALITY_RESOLUTION_REQUEST_V1",
    routeNativeIdentity,
    namespace:proposal.protocol.toLowerCase(),
    authorityDomain:`device:${proposal.scopeDeviceId}`,
    resourceKind:resourceKindFor(resolver.manifest),
    aliases:[...new Set(aliases)].sort(),
    parentRefs:[],
    identityEvidenceRefs:[...new Set(identityEvidenceRefs)].sort(),
    context:{semanticEffectKind:proposal.semanticEffect.kind},
    authority:false
  });
}

export const defaultCanonicalRealityResolverRegistry=()=>new CanonicalRealityResolverRegistry();

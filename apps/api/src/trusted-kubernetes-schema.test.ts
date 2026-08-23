import {describe,expect,it} from "vitest";
import {KubernetesDeploymentArgsSchema} from "./trusted-kubernetes-adapter.js";

const digest="a".repeat(64);
const base={expectedUid:"uid-123",expectedResourceVersion:"42",expectedCurrentImage:"registry.example/app@sha256:"+"b".repeat(64)};

describe("Kubernetes deployment argument schema",()=>{
  it("accepts an exact digest-pinned replacement image",()=>{expect(KubernetesDeploymentArgsSchema.parse({...base,newImage:`registry.example/app@sha256:${digest}`})).toEqual({...base,newImage:`registry.example/app@sha256:${digest}`})});
  it("rejects mutable tags and malformed digests",()=>{for(const newImage of ["registry.example/app:latest","registry.example/app:v2","registry.example/app@sha256:abc","registry.example/app@sha256:"+"A".repeat(64)])expect(KubernetesDeploymentArgsSchema.safeParse({...base,newImage}).success).toBe(false)});
  it("rejects extra authority arguments",()=>{expect(KubernetesDeploymentArgsSchema.safeParse({...base,newImage:`registry.example/app@sha256:${digest}`,namespace:"other"}).success).toBe(false)});
});

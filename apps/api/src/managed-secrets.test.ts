import {afterEach,describe,expect,it} from "vitest";
import {consumeManagedSecrets,installManagedSecrets} from "./managed-secrets.js";

const valid=()=>({jwtSecret:"j".repeat(48),receiptSigningSecret:"r".repeat(48),gatewayToken:"g".repeat(64)});
afterEach(()=>{consumeManagedSecrets()});

describe("managed secret bootstrap",()=>{
  it("installs and consumes exactly once",()=>{
    const value=valid();installManagedSecrets(value);
    expect(consumeManagedSecrets()).toEqual(value);
    expect(consumeManagedSecrets()).toBeUndefined();
  });
  it("rejects unknown fields",()=>expect(()=>installManagedSecrets({...valid(),extra:"x"})).toThrow("fields_invalid"));
  it("rejects weak secrets",()=>expect(()=>installManagedSecrets({...valid(),jwtSecret:"short"})).toThrow("jwtSecret_invalid"));
  it("rejects identical signing roots",()=>{const root="x".repeat(48);expect(()=>installManagedSecrets({...valid(),jwtSecret:root,receiptSigningSecret:root})).toThrow("roots_must_be_distinct")});
  it("rejects a second install before consumption",()=>{installManagedSecrets(valid());expect(()=>installManagedSecrets(valid())).toThrow("already_installed")});
});

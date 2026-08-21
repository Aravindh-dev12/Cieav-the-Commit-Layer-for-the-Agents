import type crypto from "node:crypto";
import {parseWindowsWbcl,replaySrtmPcrs} from "./windows-tpm-measured-boot.js";
import {linuxTpm2PcrKey,verifyLinuxTpm2AttestationSignature,verifyLinuxTpm2QuoteBinding,type LinuxTpm2QuoteAttest} from "./linux-tpm2-attestation.js";

export type LinuxTpm2FirmwareLogBinding={quote:LinuxTpm2QuoteAttest;eventCount:number;platformClass:number;specVersion:{major:number;minor:number;errata:number;uintnSize:number};replayedPcrs:ReadonlyMap<string,Buffer>};
function fail(code:string):never{throw new Error(`linux_tpm2_measured_boot_${code}`)}

export function verifyLinuxTpm2FirmwareLogQuote(input:{rawQuote:Buffer;rawSignature:Buffer;expectedNonce:Buffer;akPublicJwk:crypto.JsonWebKey;eventLog:Buffer}):LinuxTpm2FirmwareLogBinding{
  const signature=verifyLinuxTpm2AttestationSignature(input.rawQuote,input.rawSignature,input.akPublicJwk),attestation=signature.attestation;if(attestation.type!=="QUOTE")fail("quote_required");
  const parsedLog=parseWindowsWbcl(input.eventLog),pcrValues=new Map<string,Buffer>();
  for(const selection of attestation.pcrSelections){
    let mask=0;for(const pcr of selection.selectedPcrs){if(pcr>15)fail("srtm_pcr_out_of_range");mask|=1<<pcr}
    const replayed=replaySrtmPcrs(parsedLog,selection.hashAlgorithm,mask);for(const [pcr,value] of replayed)pcrValues.set(linuxTpm2PcrKey(selection.hashAlgorithm,pcr),value);
  }
  const quote=verifyLinuxTpm2QuoteBinding(input.rawQuote,input.expectedNonce,pcrValues,signature.signatureHashAlgorithm);
  return{quote,eventCount:parsedLog.events.length,platformClass:parsedLog.platformClass,specVersion:parsedLog.specVersion,replayedPcrs:pcrValues};
}

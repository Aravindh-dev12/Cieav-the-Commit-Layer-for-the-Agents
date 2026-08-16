import crypto from "node:crypto";
import {chmod,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {CommitCapabilitySchema,SignedCommitCapabilitySchema,type Commitment,type EffectProposal,type SignedCommitCapability} from "@cieav/contracts";
import {authorityKeyId,commitCapabilitySigningPayload,consequenceGraphDigest,effectProposalDigest,proofObligationDigest} from "
# CIEAV AWS EC2 Execution

AWS is a first-class `AWS` consequence protocol. The initial primitive is deliberately narrow:

```text
AWS_EC2_STOP_INSTANCE
```

It authorizes one graceful stop request for one exact EC2 instance. It is not generic AWS API, AWS CLI, SDK, shell, or arbitrary Query API authority.

## Trusted configuration

The execution catalog fixes:

- AWS partition: `AWS`, `AWS_CN`, or `AWS_US_GOV`;
- exact Region;
- exact EC2 instance ID;
- environment names for access-key ID, secret access key, and optional session token;
- timeout and response-size bounds.

The EC2 endpoint is derived by CIEAV from partition + Region. Agents cannot supply an endpoint, action name, instance ID, force flag, hibernation flag, shutdown mode, or arbitrary API parameter.

## Authority arguments

Normalized ticket arguments are exactly:

```json
{"expectedState":"running"}
```

The schema is strict. Dynamic force, hibernate, instance, endpoint, or action parameters are rejected.

The proposal target is:

```text
aws-ec2-instance:<partition>:<region>:<instance-id>
```

The downstream reference additionally binds the derived EC2 endpoint and credential environment names. Secret credential values never enter the target, downstream reference, evidence summary, or execution metadata.

## SigV4

CIEAV signs requests directly with AWS Signature Version 4. It does not use an ambient AWS credential chain, instance metadata service, web-identity discovery, AWS CLI, credential process, or SDK default configuration.

The signer builds a canonical POST request, SHA-256 payload hash, date/Region/service credential scope, HMAC-SHA256 signing key, and `Authorization` header. Temporary credentials are supported only when the configured session-token environment variable is present; `x-amz-security-token` is included in the signed headers.

Production credentials should be short-lived and least-privileged. Execution credentials should allow only the exact EC2 read/stop permissions required by this primitive and should be distinct from proof credentials.

## Network boundary

CIEAV derives only official EC2 regional hostnames:

```text
ec2.<region>.amazonaws.com
ec2.<region>.amazonaws.com.cn
```

Partition/Region mismatches fail closed. DNS answers are resolved inside CIEAV; if any answer is private, loopback, link-local, multicast, documentation/reserved, or otherwise disallowed, the call fails. The HTTPS socket is pinned to a validated resolved address while TLS retains the official AWS hostname for certificate verification. Requests do not follow redirects and use no shell or CLI process.

## Pre-state observation

Before the stop effect, CIEAV issues only:

```text
DescribeInstances
InstanceId.1=<fixed-instance-id>
Version=2016-11-15
```

The XML response must contain exactly the configured instance ID and one unambiguous instance state. The state must still be `running` before the stop request can proceed.

## Sole mutation

The only mutation action is `StopInstances` with an internally constructed Query API body:

```text
Action=StopInstances
InstanceId.1=<fixed-instance-id>
Version=2016-11-15
Force=false
Hibernate=false
SkipOsShutdown=false
```

CIEAV does not expose `Force`, `Hibernate`, or `SkipOsShutdown` as agent-controlled inputs. It never calls `TerminateInstances`, `RebootInstances`, `StartInstances`, or another AWS action through this adapter.

## Outcome semantics

A pre-effect state change is `REJECTED` before a stop request starts.

A clean AWS 2xx response is transport `ACCEPTED`; it is not verified success. If an abnormal/non-2xx request has crossed the effect boundary, CIEAV may reconcile to transport `ACCEPTED` only when an exact subsequent `DescribeInstances` observes `stopping` or `stopped`. Otherwise the effect remains `UNKNOWN`.

A readback of `running` immediately after a started stop request is not sufficient to prove that no AWS-side consequence occurred.

## Independent proof

Settlement uses the separate provider:

```text
cieav.aws-ec2-proof.v1
```

configured through:

```text
CIEAV_PROOF_AWS_EC2_CATALOG
```

The provider uses its own AWS credential binding and performs `DescribeInstances` only. It contains no `StopInstances`, other EC2 mutation, ticket consumption, credential issuance, or authority minting path.

Supported deterministic expectation syntax is:

```text
state:<exact EC2 state>
```

EC2 observation is eventually consistent. Therefore the provider concludes `SUCCESS` only when the expected state is actually observed. A mismatch is non-conclusive rather than immediately `FAILURE`; callers may re-observe within the proof obligation's allowed window. Unknown expectation syntax and observation errors are also non-conclusive.

Every proof result has:

```text
authority=false
mayMintExecutionAuthority=false
```

## Qualification boundary

Repository-local qualification covers first-class protocol registration, exact catalog binding, strict dynamic arguments, deterministic SigV4 regression, endpoint/DNS guards, graceful-only StopInstances construction, authority-free proof, and conservative ambiguity handling.

Production acceptance still requires real AWS-account qualification: IAM policy/permission boundaries, temporary-credential issuance and rotation, CloudTrail/audit behavior, EC2 eventual consistency, endpoint/TLS behavior, Organizations/SCP constraints, instance shutdown behavior, retry/failure scenarios, and operational recovery. Fixtures or static tests do not satisfy those external gates.

# CIEAV Azure VM Execution Contract

CIEAV exposes Azure Compute as a first-class `AZURE` execution protocol rather than routing it through generic cloud or CLI authority.

## Operation

`AZURE_VM_DEALLOCATE`

The trusted catalog fixes the subscription ID, resource group, VM name, bearer-token environment binding, request bounds, ARM hostname, and API version. Agents cannot supply ARM URLs, API versions, resource IDs, methods, arbitrary JSON, or alternate VM actions.

Normalized arguments contain only:

```json
{"expectedPowerState":"PowerState/running"}
```

Before consuming downstream effect authority, CIEAV performs a read-only `instanceView` request for the exact VM and requires one unambiguous `PowerState/running` status.

The sole mutation is:

```text
POST https://management.azure.com/subscriptions/<fixed-subscription>/resourceGroups/<fixed-rg>/providers/Microsoft.Compute/virtualMachines/<fixed-vm>/deallocate?hibernate=false&api-version=2025-04-01
```

`hibernate=false` is fixed by construction. No start, restart, delete, redeploy, reimage, capture, generalize, PATCH, PUT, or arbitrary ARM operation is exposed.

A clean HTTP 200/202 is transport `ACCEPTED` only. It does not prove the VM reached the deallocated power state. After the POST request crosses the conservative effect boundary, ambiguous failures remain `UNKNOWN` unless an exact subsequent `instanceView` observation finds `PowerState/deallocated`.

## Identity and network binding

The authority target binds subscription ID, resource group, and VM name. The downstream reference additionally binds the canonical ARM hostname, API version, and configured token environment name. The token value is never placed in target identity, downstream identity, evidence summaries, or execution metadata.

CIEAV resolves `management.azure.com`, rejects private/link-local/reserved/documentation destinations, pins the selected validated address for the HTTPS socket, and retains the official hostname for TLS certificate verification.

## Independent proof

`cieav.azure-vm-proof.v1` is separately configured through `CIEAV_PROOF_AZURE_VM_CATALOG`. It performs only GET `instanceView` observations and returns `authority=false` and `mayMintExecutionAuthority=false` on every path.

Production should use a distinct read-only Azure principal/token that can observe only the intended VM resources. The execution token and proof token must be independently issued and rotated wherever operationally feasible.

## External qualification boundary

Repository-local implementation does not qualify real Azure identity or infrastructure. Production acceptance still requires real Azure tenants/subscriptions, ARM token audience and expiry validation through Azure, least-privilege RBAC, Conditional Access/identity policy where applicable, real VM deallocation behavior, long-running-operation semantics, activity logs, token rotation/revocation, network/TLS topology, and incident/recovery exercises.

No model, agent, router, memory subsystem, proof provider, or Azure adapter can mint authority. Transport `ACCEPTED` never means independently proven real-world success.

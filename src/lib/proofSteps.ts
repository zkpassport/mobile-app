import { TimingEvents } from "@/types/ProofService"

export enum ProofStep {
  Dsc = "dsc",
  IdData = "id_data",
  Integrity = "integrity",
  DisclosureProofs = "disclosure_proofs",
  OprfAuthProofs = "oprf_auth_proofs",
  OprfServerRequest = "oprf_server_request",
  CloudProver = "cloud_prover",
}

export function baseSubproofNameToStep(name: string): ProofStep | undefined {
  switch (name) {
    case "dsc_subproof":
      return ProofStep.Dsc
    case "id_data_subproof":
      return ProofStep.IdData
    case "integrity_check_subproof":
      return ProofStep.Integrity
    default:
      return undefined
  }
}

const TIMED_PROOF_STEPS = [
  {
    name: ProofStep.OprfAuthProofs,
    start: TimingEvents.OprfAuthProofsStart,
    end: TimingEvents.OprfAuthProofsComplete,
  },
  {
    name: ProofStep.OprfServerRequest,
    start: TimingEvents.OprfServerRequestStart,
    end: TimingEvents.OprfServerRequestComplete,
  },
  {
    name: ProofStep.CloudProver,
    start: TimingEvents.CloudProverStart,
    end: TimingEvents.CloudProverComplete,
  },
] as const

/** Collects per-step durations from proving progress stages; only completed steps get an entry. */
export function createStepTimer() {
  const startedAt = new Map<ProofStep, number>()
  const durations: Record<string, number> = {}
  let running: ProofStep | undefined
  return {
    onStage(stage: string): void {
      const starting = TIMED_PROOF_STEPS.find((s) => s.start === stage)
      if (starting) {
        running = starting.name
        // Keep only the first start: this stage fires twice (the disclosure circuits are built twice).
        if (!startedAt.has(starting.name)) startedAt.set(starting.name, Date.now())
        return
      }
      const ending = TIMED_PROOF_STEPS.find((s) => s.end === stage)
      if (!ending) return
      if (running === ending.name) running = undefined
      const start = startedAt.get(ending.name)
      if (start !== undefined && durations[`${ending.name}_ms`] === undefined) {
        durations[`${ending.name}_ms`] = Date.now() - start
      }
    },
    durations,
    /** The step that was still running when proving stopped — on failure, the step that failed. */
    runningStep: () => running,
  }
}

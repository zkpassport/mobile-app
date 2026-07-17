import { NativeModules } from "react-native"

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe("generateProof queueing", () => {
  const proveMock = jest.fn()
  let generateProof: typeof import("@/lib/noir").generateProof

  beforeEach(() => {
    jest.resetModules()
    proveMock.mockReset()
    ;(NativeModules as any).NoirModule = {
      prove: proveMock,
    }
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const noir = require("@/lib/noir") as typeof import("@/lib/noir")
      generateProof = noir.generateProof
    })
  })

  it("serializes concurrent proof requests", async () => {
    const first = createDeferred<{ proof: string }>()
    const second = createDeferred<{ proof: string }>()

    proveMock.mockImplementationOnce(() => first.promise)
    proveMock.mockImplementationOnce(() => second.promise)

    const proofPromise1 = generateProof({}, "circuit-1", "vkey-1")
    const proofPromise2 = generateProof({}, "circuit-2", "vkey-2")

    await Promise.resolve()

    expect(proveMock).toHaveBeenCalledTimes(1)

    // generateProof strips the 4-byte (8 hex char) noir_rs num_public_inputs prefix
    first.resolve({ proof: "00000000proof-one" })
    await expect(proofPromise1).resolves.toEqual({ proofWithPublicInputs: "proof-one" })

    await new Promise((resolve) => setImmediate(resolve))
    expect(proveMock).toHaveBeenCalledTimes(2)

    second.resolve({ proof: "00000000proof-two" })
    await expect(proofPromise2).resolves.toEqual({ proofWithPublicInputs: "proof-two" })
  })

  it("continues queue after a proof generation failure", async () => {
    const first = createDeferred<{ proof: string }>()
    const second = createDeferred<{ proof: string }>()

    proveMock.mockImplementationOnce(() => first.promise)
    proveMock.mockImplementationOnce(() => second.promise)

    const proofPromise1 = generateProof({}, "circuit-1", "vkey-1")
    const proofPromise2 = generateProof({}, "circuit-2", "vkey-2")

    await Promise.resolve()

    const error = new Error("prover failed")
    first.reject(error)

    await expect(proofPromise1).rejects.toThrow("prover failed")

    await new Promise((resolve) => setImmediate(resolve))
    expect(proveMock).toHaveBeenCalledTimes(2)

    second.resolve({ proof: "00000000proof-two" })
    await expect(proofPromise2).resolves.toEqual({ proofWithPublicInputs: "proof-two" })
  })
})

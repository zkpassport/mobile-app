// import { NativeModules, Platform } from "react-native"
import { computeMerkleProof as computeMerkleProofTS } from "@zkpassport/utils"
// const { NativeOperationsModule: NativeOperations } = NativeModules

export async function computeMerkleProof(
  leaves: bigint[],
  index: number,
  height: number,
): Promise<{ root: string; index: number; path: string[] }> {
  return await computeMerkleProofTS(leaves, index, height)
  /* Platform.OS === "android"
    ? NativeOperations.computeMerkleProof(
        leaves.map((x) => x.toString()),
        index,
        height,
      )
    : await computeMerkleProofTS(leaves, index, height) */
}

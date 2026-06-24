import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"BadDistributionLen"},
  3: {message:"BadDistributionSum"},
  4: {message:"NonPositiveEntryFee"},
  5: {message:"OrganizerIsReferee"},
  6: {message:"NotInitialized"},
  7: {message:"AlreadyFinished"},
  8: {message:"AlreadyCancelled"},
  9: {message:"AlreadyJoined"},
  10: {message:"WinnersNotDistinct"},
  11: {message:"WinnerNotRegistered"}
}

export type DataKey = {tag: "Organizer", values: void} | {tag: "Referee", values: void} | {tag: "Token", values: void} | {tag: "EntryFee", values: void} | {tag: "DistributionBps", values: void} | {tag: "Players", values: void} | {tag: "Finished", values: void} | {tag: "Cancelled", values: void} | {tag: "Winners", values: void};

export interface Client {
  /**
   * Construct and simulate a get_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_pool: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_reward transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reward: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({organizer, referee, token, entry_fee, distribution_bps}: {organizer: string, referee: string, token: string, entry_fee: i128, distribution_bps: Array<u32>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_finished transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_finished: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a join_tournament transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  join_tournament: ({player}: {player: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a finalize_results transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  finalize_results: ({first, second, third}: {first: string, second: string, third: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_tournament transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_tournament: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAABJCYWREaXN0cmlidXRpb25MZW4AAAAAAAIAAAAAAAAAEkJhZERpc3RyaWJ1dGlvblN1bQAAAAAAAwAAAAAAAAATTm9uUG9zaXRpdmVFbnRyeUZlZQAAAAAEAAAAAAAAABJPcmdhbml6ZXJJc1JlZmVyZWUAAAAAAAUAAAAAAAAADk5vdEluaXRpYWxpemVkAAAAAAAGAAAAAAAAAA9BbHJlYWR5RmluaXNoZWQAAAAABwAAAAAAAAAQQWxyZWFkeUNhbmNlbGxlZAAAAAgAAAAAAAAADUFscmVhZHlKb2luZWQAAAAAAAAJAAAAAAAAABJXaW5uZXJzTm90RGlzdGluY3QAAAAAAAoAAAAAAAAAE1dpbm5lck5vdFJlZ2lzdGVyZWQAAAAACw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAAAAAAAAAAACU9yZ2FuaXplcgAAAAAAAAAAAAAAAAAAB1JlZmVyZWUAAAAAAAAAAAAAAAAFVG9rZW4AAAAAAAAAAAAAAAAAAAhFbnRyeUZlZQAAAAAAAAAAAAAAD0Rpc3RyaWJ1dGlvbkJwcwAAAAAAAAAAAAAAAAdQbGF5ZXJzAAAAAAAAAAAAAAAACEZpbmlzaGVkAAAAAAAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAAAAAAAAAAAAAHV2lubmVycwA=",
        "AAAAAAAAAAAAAAAIZ2V0X3Bvb2wAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAKZ2V0X3Jld2FyZAAAAAAAAQAAAAAAAAAGcGxheWVyAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABQAAAAAAAAAJb3JnYW5pemVyAAAAAAAAEwAAAAAAAAAHcmVmZXJlZQAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAACWVudHJ5X2ZlZQAAAAAAAAsAAAAAAAAAEGRpc3RyaWJ1dGlvbl9icHMAAAPqAAAABAAAAAA=",
        "AAAAAAAAAAAAAAALaXNfZmluaXNoZWQAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAPam9pbl90b3VybmFtZW50AAAAAAEAAAAAAAAABnBsYXllcgAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAQZmluYWxpemVfcmVzdWx0cwAAAAMAAAAAAAAABWZpcnN0AAAAAAAAEwAAAAAAAAAGc2Vjb25kAAAAAAATAAAAAAAAAAV0aGlyZAAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAARY2FuY2VsX3RvdXJuYW1lbnQAAAAAAAAAAAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_pool: this.txFromJSON<i128>,
        get_reward: this.txFromJSON<i128>,
        initialize: this.txFromJSON<null>,
        is_finished: this.txFromJSON<boolean>,
        join_tournament: this.txFromJSON<null>,
        finalize_results: this.txFromJSON<null>,
        cancel_tournament: this.txFromJSON<null>
  }
}
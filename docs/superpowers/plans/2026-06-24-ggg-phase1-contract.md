# Phase 1 — Soroban Escrow Contract Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement, test, build, and publish a trustless, asset-agnostic tournament prize-escrow Soroban contract whose `require_auth()` rules independently enforce every fund-movement invariant in SPEC §4 / AGENT §6.

**Architecture:** A single `#![no_std]` `soroban-sdk` 26 contract (`contracts/escrow`) holds organizer/referee/token/entry_fee/distribution_bps/players/finished/cancelled/winners in instance storage. Entry fees are pulled and payouts/refunds pushed via the token SAC client (`transfer`), making it asset-agnostic for XLM and USDC. `finalize_results` and `cancel_tournament` are single-shot (guarded by `finished`/`cancelled`), all money is `i128` with checked arithmetic, rounding dust is assigned deterministically to 1st place, and every state change emits an event for the off-chain subscriber.

**Tech Stack:** Rust, soroban-sdk 26, stellar-cli 26, target `wasm32v1-none`.

## Global Constraints
- soroban-sdk 26; pin the exact patch in `Cargo.toml` and commit `Cargo.lock`.
- `#![no_std]` — no std library; only `soroban_sdk` types (`Vec`, `Symbol`, `Address`, etc.).
- Compile to `wasm32v1-none` via `stellar contract build`.
- Money is `i128` in the token's smallest unit; ALL arithmetic uses checked ops (`checked_mul`/`checked_add`/`checked_sub`) and panics on overflow.
- `require_auth()` on organizer/referee/player is the source of truth for authorization — no server-held keys ever authorize fund movement.
- No withdraw function: funds exit ONLY through payout (`finalize_results`) or refund (`cancel_tournament`) logic.
- Single-shot `finalize_results` / `cancel_tournament`: guarded by `finished` / `cancelled` flags; neither runs after the other.
- One event per state change: `registered`, `finalized`, `cancelled`.
- The comprehensive `#[cfg(test)]` suite (every happy path AND every revert) is part of "done"; `cargo test` must be fully green before build/upload.

---

## File Structure
- `contracts/escrow/Cargo.toml` — crate manifest: `crate-type = ["cdylib"]`, soroban-sdk 26 dep + `testutils` dev-dep, release profile for WASM size.
- `contracts/escrow/src/lib.rs` — the contract: storage keys, `DataKey` enum, `#[contract]`/`#[contractimpl]` with all seven public fns, event emission, checked arithmetic, dust logic.
- `contracts/escrow/src/test.rs` — exhaustive `#[cfg(test)]` suite: helpers (env, SAC token, minting), happy paths, every revert, rounding/dust.

---

### Task 1: Crate scaffold & storage model

**Files:** Create `contracts/escrow/Cargo.toml`, `contracts/escrow/src/lib.rs`, `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: the crate skeleton, the `DataKey` storage enum, and an empty `Escrow` contract type that later tasks fill in.
Consumes: nothing (Phase 0 foundation only — this task creates the `contracts/escrow` crate from scratch).

- [ ] **Step 1: Write `Cargo.toml`.**
  Create `contracts/escrow/Cargo.toml`:
  ```toml
  [package]
  name = "ggg-escrow"
  version = "0.1.0"
  edition = "2021"
  publish = false

  [lib]
  crate-type = ["cdylib", "rlib"]
  doctest = false

  [dependencies]
  soroban-sdk = "26"

  [dev-dependencies]
  soroban-sdk = { version = "26", features = ["testutils"] }

  [profile.release]
  opt-level = "z"
  overflow-checks = true
  debug = false
  strip = "symbols"
  codegen-units = 1
  lto = true
  panic = "abort"
  ```
  Note: `crate-type` includes `rlib` so `cargo test` can compile the test harness; `cdylib` produces the WASM. The output WASM name is `ggg_escrow.wasm` (cargo replaces `-` with `_`).

- [ ] **Step 2: Write the storage model and empty contract in `lib.rs`.**
  Create `contracts/escrow/src/lib.rs`:
  ```rust
  #![no_std]
  use soroban_sdk::{contract, contracterror, contracttype, Address, Env, Vec};

  #[contracttype]
  #[derive(Clone)]
  pub enum DataKey {
      Organizer,
      Referee,
      Token,
      EntryFee,
      DistributionBps,
      Players,
      Finished,
      Cancelled,
      Winners,
  }

  #[contracterror]
  #[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
  #[repr(u32)]
  pub enum Error {
      AlreadyInitialized = 1,
      BadDistributionLen = 2,
      BadDistributionSum = 3,
      NonPositiveEntryFee = 4,
      OrganizerIsReferee = 5,
      NotInitialized = 6,
      AlreadyFinished = 7,
      AlreadyCancelled = 8,
      AlreadyJoined = 9,
      WinnersNotDistinct = 10,
      WinnerNotRegistered = 11,
  }

  #[contract]
  pub struct Escrow;

  mod contract_impl;

  #[cfg(test)]
  mod test;
  ```
  Note: implementation lives in an inline `#[contractimpl] impl Escrow { ... }` block added in later tasks. To keep this plan's tasks additive within one file, put the `#[contractimpl]` block directly in `lib.rs` (delete the `mod contract_impl;` line) — Task 2 adds the first method there. Keep the `DataKey` and `Error` enums above it.
  Corrected `lib.rs` tail (replace the `mod contract_impl;` line with):
  ```rust
  #[contractimpl]
  impl Escrow {
      // methods added in Tasks 2–8
  }

  #[cfg(test)]
  mod test;
  ```
  And add `contractimpl` to the import: `use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Vec};`

- [ ] **Step 3: Write a placeholder test module so the crate compiles.**
  Create `contracts/escrow/src/test.rs`:
  ```rust
  #![cfg(test)]
  extern crate std;

  use soroban_sdk::{
      testutils::Address as _,
      token::{StellarAssetClient, TokenClient},
      Address, Env, Vec,
  };

  use crate::{Escrow, EscrowClient};

  // Registers a Stellar Asset Contract (SAC) test token and returns its
  // admin client (for minting) and the standard token client.
  fn create_token<'a>(env: &Env, admin: &Address) -> (Address, StellarAssetClient<'a>, TokenClient<'a>) {
      let sac = env.register_stellar_asset_contract_v2(admin.clone());
      let token_address = sac.address();
      (
          token_address.clone(),
          StellarAssetClient::new(env, &token_address),
          TokenClient::new(env, &token_address),
      )
  }

  // Deploys the escrow contract and returns a typed client.
  fn create_escrow(env: &Env) -> EscrowClient {
      let id = env.register(Escrow, ());
      EscrowClient::new(env, &id)
  }

  #[test]
  fn crate_compiles() {
      let env = Env::default();
      let admin = Address::generate(&env);
      let (_token_addr, _sac, _token) = create_token(&env, &admin);
      let _escrow = create_escrow(&env);
  }
  ```
  Note: `EscrowClient` is generated by `#[contractimpl]`; with an empty impl block it still generates. `register_stellar_asset_contract_v2` returns a struct exposing `.address()`. `StellarAssetClient` is the admin/mint interface; `TokenClient` is the SEP-41 transfer/balance interface.

- [ ] **Step 4: Run, expect compile success (no real tests yet).**
  `cd contracts/escrow && cargo test crate_compiles`
  Expected output: `test test::crate_compiles ... ok` and `test result: ok. 1 passed`.

- [ ] **Step 5: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: escrow crate scaffold + storage model

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 2: `initialize`

**Files:** Modify `contracts/escrow/src/lib.rs`, Test `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: `initialize(env: Env, organizer: Address, referee: Address, token: Address, entry_fee: i128, distribution_bps: Vec<u32>)`.
Behavior: `organizer.require_auth()`; validate `distribution_bps.len() == 3`, `sum == 10000`, `entry_fee > 0`, `organizer != referee`; panic if already initialized; persist all fields, set `finished=false`, `cancelled=false`.
Consumes: `DataKey`, `Error` from Task 1.

- [ ] **Step 1: Write failing test for the happy path.**
  Add to `test.rs`:
  ```rust
  use soroban_sdk::IntoVal;

  fn bps(env: &Env) -> Vec<u32> {
      Vec::from_array(env, [6000u32, 3000u32, 1000u32])
  }

  #[test]
  fn initialize_stores_state() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);

      escrow.initialize(&organizer, &referee, &token_addr, &1_000_000i128, &bps(&env));

      // get_pool reflects zero players initially.
      assert_eq!(escrow.get_pool(), 0i128);
      assert_eq!(escrow.is_finished(), false);
  }
  ```
  Note: this test also exercises `get_pool` / `is_finished` (Tasks 5 & 7). To keep Task 2 self-contained, the minimal impl below ALSO adds stub `get_pool`/`is_finished`; Tasks 5 & 7 refine them. If preferring strict one-fn-per-task, replace the asserts here with a direct storage check via `env.as_contract(&escrow.address, || { ... })`. Recommended: include the stubs now.

- [ ] **Step 2: Run, expect FAIL.**
  `cd contracts/escrow && cargo test initialize_stores_state`
  Expected failure: compile error `no method named `initialize` found for struct `EscrowClient`` (method not yet implemented).

- [ ] **Step 3: Minimal implementation in `lib.rs`.**
  Inside `impl Escrow`:
  ```rust
  pub fn initialize(
      env: Env,
      organizer: Address,
      referee: Address,
      token: Address,
      entry_fee: i128,
      distribution_bps: Vec<u32>,
  ) {
      if env.storage().instance().has(&DataKey::Organizer) {
          panic_with_error!(&env, Error::AlreadyInitialized);
      }
      organizer.require_auth();

      if distribution_bps.len() != 3 {
          panic_with_error!(&env, Error::BadDistributionLen);
      }
      let mut sum: u32 = 0;
      for b in distribution_bps.iter() {
          sum = sum.checked_add(b).expect("bps sum overflow");
      }
      if sum != 10_000 {
          panic_with_error!(&env, Error::BadDistributionSum);
      }
      if entry_fee <= 0 {
          panic_with_error!(&env, Error::NonPositiveEntryFee);
      }
      if organizer == referee {
          panic_with_error!(&env, Error::OrganizerIsReferee);
      }

      let storage = env.storage().instance();
      storage.set(&DataKey::Organizer, &organizer);
      storage.set(&DataKey::Referee, &referee);
      storage.set(&DataKey::Token, &token);
      storage.set(&DataKey::EntryFee, &entry_fee);
      storage.set(&DataKey::DistributionBps, &distribution_bps);
      storage.set(&DataKey::Players, &Vec::<Address>::new(&env));
      storage.set(&DataKey::Finished, &false);
      storage.set(&DataKey::Cancelled, &false);
  }

  pub fn get_pool(env: Env) -> i128 {
      let players: Vec<Address> = env
          .storage()
          .instance()
          .get(&DataKey::Players)
          .unwrap_or(Vec::new(&env));
      let entry_fee: i128 = env
          .storage()
          .instance()
          .get(&DataKey::EntryFee)
          .unwrap_or(0);
      (players.len() as i128)
          .checked_mul(entry_fee)
          .expect("pool overflow")
  }

  pub fn is_finished(env: Env) -> bool {
      env.storage()
          .instance()
          .get(&DataKey::Finished)
          .unwrap_or(false)
  }
  ```
  Add `panic_with_error` to imports: `use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Vec};`

- [ ] **Step 4: Run, expect PASS.**
  `cd contracts/escrow && cargo test initialize_stores_state`
  Expected: `test test::initialize_stores_state ... ok`.

- [ ] **Step 5: Write failing tests for every `initialize` revert.**
  Add to `test.rs`:
  ```rust
  #[test]
  #[should_panic(expected = "Error(Contract, #2)")] // BadDistributionLen
  fn initialize_rejects_bad_bps_len() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      let bad = Vec::from_array(&env, [6000u32, 4000u32]); // len 2
      escrow.initialize(&organizer, &referee, &token_addr, &1i128, &bad);
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #3)")] // BadDistributionSum
  fn initialize_rejects_bad_bps_sum() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      let bad = Vec::from_array(&env, [6000u32, 3000u32, 500u32]); // sum 9500
      escrow.initialize(&organizer, &referee, &token_addr, &1i128, &bad);
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #4)")] // NonPositiveEntryFee
  fn initialize_rejects_zero_entry_fee() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      escrow.initialize(&organizer, &referee, &token_addr, &0i128, &bps(&env));
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #5)")] // OrganizerIsReferee
  fn initialize_rejects_organizer_equals_referee() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let same = Address::generate(&env);
      let escrow = create_escrow(&env);
      escrow.initialize(&same, &same, &token_addr, &1i128, &bps(&env));
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #1)")] // AlreadyInitialized
  fn initialize_rejects_double_init() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      escrow.initialize(&organizer, &referee, &token_addr, &1i128, &bps(&env));
      escrow.initialize(&organizer, &referee, &token_addr, &1i128, &bps(&env));
  }

  #[test]
  #[should_panic] // missing auth → AuthError
  fn initialize_requires_organizer_auth() {
      let env = Env::default();
      // NOTE: no mock_all_auths(); organizer.require_auth() must fail.
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      escrow.initialize(&organizer, &referee, &token_addr, &1i128, &bps(&env));
  }
  ```
  Note: the unauthorized test deliberately omits `mock_all_auths()` so `require_auth()` panics with an auth error.

- [ ] **Step 6: Run, expect PASS (impl from Step 3 already satisfies these).**
  `cd contracts/escrow && cargo test initialize`
  Expected: all six `initialize_*` tests pass: `test result: ok`.

- [ ] **Step 7: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: initialize with full validation + reverts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 3: `join_tournament`

**Files:** Modify `contracts/escrow/src/lib.rs`, Test `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: `join_tournament(env: Env, player: Address)`.
Behavior: `player.require_auth()`; reject if `finished`/`cancelled`; reject duplicate join; `token.transfer(player, contract, entry_fee)`; append player; emit `registered → (player, pool_after)`.
Consumes: storage from Task 2; `soroban_sdk::token::TokenClient` for transfer.

- [ ] **Step 1: Write failing test for happy-path join (pool grows, funds escrowed).**
  Add to `test.rs`:
  ```rust
  fn init_default<'a>(
      env: &'a Env,
      escrow: &EscrowClient<'a>,
      token_addr: &Address,
      organizer: &Address,
      referee: &Address,
  ) {
      escrow.initialize(organizer, referee, token_addr, &1_000_000i128, &bps(env));
  }

  #[test]
  fn join_transfers_fee_and_records_player() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);

      let player = Address::generate(&env);
      sac.mint(&player, &5_000_000i128); // fund the player

      escrow.join_tournament(&player);

      assert_eq!(escrow.get_pool(), 1_000_000i128);
      // fee left player, sits in contract escrow.
      assert_eq!(token.balance(&player), 4_000_000i128);
      assert_eq!(token.balance(&escrow.address), 1_000_000i128);
  }
  ```
  Note: `sac.mint(&player, &amount)` uses the SAC admin client to fund the player. `escrow.address` is the deployed contract address on the typed client.

- [ ] **Step 2: Run, expect FAIL.**
  `cd contracts/escrow && cargo test join_transfers_fee_and_records_player`
  Expected failure: `no method named `join_tournament` found`.

- [ ] **Step 3: Minimal implementation in `lib.rs`.**
  Inside `impl Escrow`:
  ```rust
  pub fn join_tournament(env: Env, player: Address) {
      player.require_auth();

      let storage = env.storage().instance();
      if !storage.has(&DataKey::Organizer) {
          panic_with_error!(&env, Error::NotInitialized);
      }
      let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
      let cancelled: bool = storage.get(&DataKey::Cancelled).unwrap_or(false);
      if finished {
          panic_with_error!(&env, Error::AlreadyFinished);
      }
      if cancelled {
          panic_with_error!(&env, Error::AlreadyCancelled);
      }

      let mut players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
      if players.contains(&player) {
          panic_with_error!(&env, Error::AlreadyJoined);
      }

      let token: Address = storage.get(&DataKey::Token).unwrap();
      let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();

      let client = token::TokenClient::new(&env, &token);
      client.transfer(&player, &env.current_contract_address(), &entry_fee);

      players.push_back(player.clone());
      storage.set(&DataKey::Players, &players);

      let pool_after = (players.len() as i128)
          .checked_mul(entry_fee)
          .expect("pool overflow");
      env.events().publish(
          (symbol_short!("registered"), player),
          pool_after,
      );
  }
  ```
  Add to imports: `use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, Env, Vec};`

- [ ] **Step 4: Run, expect PASS.**
  `cd contracts/escrow && cargo test join_transfers_fee_and_records_player`
  Expected: `ok. 1 passed`.

- [ ] **Step 5: Write failing tests for join reverts (double-join, after finish, after cancel).**
  Add to `test.rs`:
  ```rust
  #[test]
  #[should_panic(expected = "Error(Contract, #9)")] // AlreadyJoined
  fn join_rejects_double_join() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let player = Address::generate(&env);
      sac.mint(&player, &5_000_000i128);
      escrow.join_tournament(&player);
      escrow.join_tournament(&player); // second time → panic
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #8)")] // AlreadyCancelled
  fn join_rejects_after_cancel() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      escrow.cancel_tournament();
      let player = Address::generate(&env);
      escrow.join_tournament(&player); // cancelled → panic
  }
  ```
  Note: `join_rejects_after_finish` is added in Task 4 (it needs `finalize_results` to exist). `join_rejects_after_cancel` needs `cancel_tournament` (Task 8); if implementing strictly in order, move `join_rejects_after_cancel` to Task 8 and keep only `join_rejects_double_join` here. Recommended: implement Tasks 2–8 then run the full reverts batch; the plan groups them logically.

- [ ] **Step 6: Run, expect PASS for double-join now (defer cancel/finish tests to their tasks).**
  `cd contracts/escrow && cargo test join_rejects_double_join`
  Expected: `ok. 1 passed`.

- [ ] **Step 7: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: join_tournament pulls fee, dedupes, emits registered

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 4: `finalize_results`

**Files:** Modify `contracts/escrow/src/lib.rs`, Test `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: `finalize_results(env: Env, first: Address, second: Address, third: Address)`.
Behavior: `referee.require_auth()` ONLY; not already finished/cancelled; the three winners distinct AND all registered; compute `prize[i] = pool * bps[i] / 10000`; dust (`pool - sum(prizes)`) added to 1st; `token.transfer(contract, winner_i, prize_i)`; set `finished=true`, store `winners`; emit `finalized → (first, second, third, amounts: Vec<i128>)`.
Consumes: storage + `get_pool` logic from Tasks 2–3; token client.

- [ ] **Step 1: Write failing test for the happy 60/30/10 split.**
  Add to `test.rs`:
  ```rust
  fn join<'a>(env: &Env, escrow: &EscrowClient<'a>, sac: &StellarAssetClient<'a>) -> Address {
      let p = Address::generate(env);
      sac.mint(&p, &10_000_000i128);
      escrow.join_tournament(&p);
      p
  }

  #[test]
  fn finalize_pays_60_30_10() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee); // entry_fee 1_000_000

      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      // pool = 3_000_000

      escrow.finalize_results(&p1, &p2, &p3);

      assert_eq!(escrow.is_finished(), true);
      // 60/30/10 of 3_000_000 = 1_800_000 / 900_000 / 300_000
      assert_eq!(token.balance(&p1), 10_000_000 - 1_000_000 + 1_800_000); // 10_800_000
      assert_eq!(token.balance(&p2), 10_000_000 - 1_000_000 + 900_000);   // 9_900_000
      assert_eq!(token.balance(&p3), 10_000_000 - 1_000_000 + 300_000);   // 9_300_000
      assert_eq!(token.balance(&escrow.address), 0i128); // pool fully distributed
      assert_eq!(escrow.get_reward(&p1), 1_800_000i128);
  }
  ```
  Note: this also touches `get_reward` (Task 6); include the `get_reward` stub now or drop that single assert. Recommended: implement `get_reward` in Task 6 and keep the assert (run this test after Task 6). If running strictly per task, comment out the last assert until Task 6.

- [ ] **Step 2: Run, expect FAIL.**
  `cd contracts/escrow && cargo test finalize_pays_60_30_10`
  Expected failure: `no method named `finalize_results` found`.

- [ ] **Step 3: Minimal implementation in `lib.rs`.**
  Inside `impl Escrow`:
  ```rust
  pub fn finalize_results(env: Env, first: Address, second: Address, third: Address) {
      let storage = env.storage().instance();
      if !storage.has(&DataKey::Organizer) {
          panic_with_error!(&env, Error::NotInitialized);
      }
      let referee: Address = storage.get(&DataKey::Referee).unwrap();
      referee.require_auth();

      let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
      let cancelled: bool = storage.get(&DataKey::Cancelled).unwrap_or(false);
      if finished {
          panic_with_error!(&env, Error::AlreadyFinished);
      }
      if cancelled {
          panic_with_error!(&env, Error::AlreadyCancelled);
      }

      // Distinct.
      if first == second || first == third || second == third {
          panic_with_error!(&env, Error::WinnersNotDistinct);
      }

      // Registered.
      let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
      if !players.contains(&first) || !players.contains(&second) || !players.contains(&third) {
          panic_with_error!(&env, Error::WinnerNotRegistered);
      }

      let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();
      let pool: i128 = (players.len() as i128)
          .checked_mul(entry_fee)
          .expect("pool overflow");
      let dist: Vec<u32> = storage.get(&DataKey::DistributionBps).unwrap();

      // prize[i] = pool * bps[i] / 10000, checked.
      let mut amounts: Vec<i128> = Vec::new(&env);
      let mut distributed: i128 = 0;
      for b in dist.iter() {
          let amt = pool
              .checked_mul(b as i128)
              .expect("prize mul overflow")
              .checked_div(10_000)
              .expect("prize div");
          amounts.push_back(amt);
          distributed = distributed.checked_add(amt).expect("dist overflow");
      }
      // Deterministic dust → 1st place.
      let dust = pool.checked_sub(distributed).expect("dust underflow");
      let first_amt = amounts.get(0).unwrap().checked_add(dust).expect("dust add");
      amounts.set(0, first_amt);

      let token: Address = storage.get(&DataKey::Token).unwrap();
      let client = token::TokenClient::new(&env, &token);
      let contract = env.current_contract_address();
      client.transfer(&contract, &first, &amounts.get(0).unwrap());
      client.transfer(&contract, &second, &amounts.get(1).unwrap());
      client.transfer(&contract, &third, &amounts.get(2).unwrap());

      storage.set(&DataKey::Finished, &true);
      storage.set(
          &DataKey::Winners,
          &(first.clone(), second.clone(), third.clone()),
      );

      env.events().publish(
          (symbol_short!("finalized"), first, second, third),
          amounts,
      );
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  `cd contracts/escrow && cargo test finalize_pays_60_30_10`
  Expected: `ok. 1 passed` (drop/defer the `get_reward` assert until Task 6 if needed).

- [ ] **Step 5: Write failing tests for finalize reverts and join-after-finish.**
  Add to `test.rs`:
  ```rust
  #[test]
  #[should_panic(expected = "Error(Contract, #10)")] // WinnersNotDistinct
  fn finalize_rejects_duplicate_winner() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let _p3 = join(&env, &escrow, &sac);
      escrow.finalize_results(&p1, &p1, &p2); // dup p1
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #11)")] // WinnerNotRegistered
  fn finalize_rejects_unregistered_winner() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let stranger = Address::generate(&env); // never joined
      escrow.finalize_results(&p1, &p2, &stranger);
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #7)")] // AlreadyFinished
  fn finalize_rejects_double_finalize() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      escrow.finalize_results(&p1, &p2, &p3);
      escrow.finalize_results(&p1, &p2, &p3); // second → panic
  }

  #[test]
  #[should_panic] // unauthorized: only referee may finalize
  fn finalize_requires_referee_auth() {
      let env = Env::default();
      // Mint requires SAC admin auth + joins require player auth, so mock for
      // setup, then assert the referee-only guard via mock_auths with a
      // non-referee invoker.
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      // Now restrict auths so referee's require_auth is NOT satisfied.
      env.set_auths(&[]); // clear all mocked auths
      escrow.finalize_results(&p1, &p2, &p3); // referee.require_auth() fails
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #7)")] // AlreadyFinished
  fn join_rejects_after_finish() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      escrow.finalize_results(&p1, &p2, &p3);
      let late = Address::generate(&env);
      sac.mint(&late, &5_000_000i128);
      escrow.join_tournament(&late); // finished → panic #7
  }
  ```
  Note: `set_auths(&[])` replaces the mocked auth set with an empty one so the subsequent `referee.require_auth()` fails (auth error panic). If the installed soroban-sdk 26 API differs, equivalently start the test WITHOUT `mock_all_auths()` and instead use `env.mock_auths(&[...])` to authorize only the SAC admin + players for setup, then invoke finalize unauthorized; pick whichever the pinned SDK supports and keep the `#[should_panic]`.

- [ ] **Step 6: Run, expect PASS.**
  `cd contracts/escrow && cargo test finalize && cargo test join_rejects_after_finish`
  Expected: all finalize reverts + `join_rejects_after_finish` pass.

- [ ] **Step 7: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: finalize_results split payout + dust + reverts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 5: `get_pool` (confirm/refine)

**Files:** Modify `contracts/escrow/src/lib.rs`, Test `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: `get_pool(env: Env) -> i128` (already stubbed in Task 2; this task confirms semantics = `players.len() * entry_fee`, checked).
Consumes: storage from Task 2.

- [ ] **Step 1: Write failing test asserting pool tracks joins.**
  Add to `test.rs`:
  ```rust
  #[test]
  fn get_pool_tracks_joins() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee); // fee 1_000_000
      assert_eq!(escrow.get_pool(), 0i128);
      let _a = join(&env, &escrow, &sac);
      assert_eq!(escrow.get_pool(), 1_000_000i128);
      let _b = join(&env, &escrow, &sac);
      assert_eq!(escrow.get_pool(), 2_000_000i128);
  }
  ```

- [ ] **Step 2: Run, expect PASS (implemented in Task 2).**
  `cd contracts/escrow && cargo test get_pool_tracks_joins`
  Expected: `ok. 1 passed`. (No new impl needed; if it fails, fix `get_pool`.)

- [ ] **Step 3: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: confirm get_pool tracks joins

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 6: `get_reward`

**Files:** Modify `contracts/escrow/src/lib.rs`, Test `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: `get_reward(env: Env, player: Address) -> i128`.
Behavior: returns the player's winnings based on placement after finalize; `0` if not finished or not a winner. Recomputes from stored `winners`, `pool`, `distribution_bps`, with the same dust→1st rule so it matches the actual transfer.
Consumes: `Winners`, `Players`, `EntryFee`, `DistributionBps`, `Finished`.

- [ ] **Step 1: Write failing test.**
  Add to `test.rs`:
  ```rust
  #[test]
  fn get_reward_returns_placement_amounts() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac); // pool 3_000_000

      // Before finalize: zero.
      assert_eq!(escrow.get_reward(&p1), 0i128);

      escrow.finalize_results(&p1, &p2, &p3);
      assert_eq!(escrow.get_reward(&p1), 1_800_000i128);
      assert_eq!(escrow.get_reward(&p2), 900_000i128);
      assert_eq!(escrow.get_reward(&p3), 300_000i128);
      // Non-winner registered player → 0; here all 3 are winners, so use a
      // stranger:
      let stranger = Address::generate(&env);
      assert_eq!(escrow.get_reward(&stranger), 0i128);
  }
  ```

- [ ] **Step 2: Run, expect FAIL.**
  `cd contracts/escrow && cargo test get_reward_returns_placement_amounts`
  Expected failure: `no method named `get_reward` found`.

- [ ] **Step 3: Minimal implementation in `lib.rs`.**
  Inside `impl Escrow`:
  ```rust
  pub fn get_reward(env: Env, player: Address) -> i128 {
      let storage = env.storage().instance();
      let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
      if !finished {
          return 0;
      }
      let winners: Option<(Address, Address, Address)> = storage.get(&DataKey::Winners);
      let (first, second, third) = match winners {
          Some(w) => w,
          None => return 0,
      };

      let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
      let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();
      let pool: i128 = (players.len() as i128)
          .checked_mul(entry_fee)
          .expect("pool overflow");
      let dist: Vec<u32> = storage.get(&DataKey::DistributionBps).unwrap();

      let mut amounts: Vec<i128> = Vec::new(&env);
      let mut distributed: i128 = 0;
      for b in dist.iter() {
          let amt = pool
              .checked_mul(b as i128)
              .expect("mul overflow")
              .checked_div(10_000)
              .expect("div");
          amounts.push_back(amt);
          distributed = distributed.checked_add(amt).expect("dist overflow");
      }
      let dust = pool.checked_sub(distributed).expect("dust underflow");
      let first_amt = amounts.get(0).unwrap().checked_add(dust).expect("dust add");

      if player == first {
          first_amt
      } else if player == second {
          amounts.get(1).unwrap()
      } else if player == third {
          amounts.get(2).unwrap()
      } else {
          0
      }
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  `cd contracts/escrow && cargo test get_reward_returns_placement_amounts`
  Expected: `ok. 1 passed`. Then re-run `cargo test finalize_pays_60_30_10` (its final `get_reward` assert now active).

- [ ] **Step 5: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: get_reward returns placement payout matching finalize

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 7: `is_finished` (confirm/refine)

**Files:** Modify `contracts/escrow/src/lib.rs`, Test `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: `is_finished(env: Env) -> bool` (stubbed in Task 2; confirm it is `false` until finalize, `true` after).
Consumes: `Finished` flag.

- [ ] **Step 1: Write failing test.**
  Add to `test.rs`:
  ```rust
  #[test]
  fn is_finished_flips_after_finalize() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      assert_eq!(escrow.is_finished(), false);
      escrow.finalize_results(&p1, &p2, &p3);
      assert_eq!(escrow.is_finished(), true);
  }
  ```

- [ ] **Step 2: Run, expect PASS (implemented in Task 2).**
  `cd contracts/escrow && cargo test is_finished_flips_after_finalize`
  Expected: `ok. 1 passed`.

- [ ] **Step 3: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: confirm is_finished flips after finalize

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 8: `cancel_tournament`

**Files:** Modify `contracts/escrow/src/lib.rs`, Test `contracts/escrow/src/test.rs`

**Interfaces:**
Produces: `cancel_tournament(env: Env)`.
Behavior: `organizer.require_auth()`; pre-finalisation only (reject if `finished`/`cancelled`); refund each registered player `entry_fee` via `token.transfer(contract, player, entry_fee)`; set `cancelled=true`; emit `cancelled → (refunded_count: u32)`.
Consumes: `Organizer`, `Players`, `EntryFee`, `Token`, `Finished`, `Cancelled`.

- [ ] **Step 1: Write failing test for happy-path refund.**
  Add to `test.rs`:
  ```rust
  #[test]
  fn cancel_refunds_all_players() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac); // each minted 10_000_000, paid 1_000_000
      let p2 = join(&env, &escrow, &sac);
      assert_eq!(token.balance(&escrow.address), 2_000_000i128);

      escrow.cancel_tournament();

      assert_eq!(token.balance(&p1), 10_000_000i128); // fully refunded
      assert_eq!(token.balance(&p2), 10_000_000i128);
      assert_eq!(token.balance(&escrow.address), 0i128);
  }
  ```

- [ ] **Step 2: Run, expect FAIL.**
  `cd contracts/escrow && cargo test cancel_refunds_all_players`
  Expected failure: `no method named `cancel_tournament` found`.

- [ ] **Step 3: Minimal implementation in `lib.rs`.**
  Inside `impl Escrow`:
  ```rust
  pub fn cancel_tournament(env: Env) {
      let storage = env.storage().instance();
      if !storage.has(&DataKey::Organizer) {
          panic_with_error!(&env, Error::NotInitialized);
      }
      let organizer: Address = storage.get(&DataKey::Organizer).unwrap();
      organizer.require_auth();

      let finished: bool = storage.get(&DataKey::Finished).unwrap_or(false);
      let cancelled: bool = storage.get(&DataKey::Cancelled).unwrap_or(false);
      if finished {
          panic_with_error!(&env, Error::AlreadyFinished);
      }
      if cancelled {
          panic_with_error!(&env, Error::AlreadyCancelled);
      }

      let players: Vec<Address> = storage.get(&DataKey::Players).unwrap();
      let entry_fee: i128 = storage.get(&DataKey::EntryFee).unwrap();
      let token: Address = storage.get(&DataKey::Token).unwrap();
      let client = token::TokenClient::new(&env, &token);
      let contract = env.current_contract_address();

      for p in players.iter() {
          client.transfer(&contract, &p, &entry_fee);
      }

      storage.set(&DataKey::Cancelled, &true);

      env.events().publish(
          (symbol_short!("cancelled"),),
          players.len() as u32,
      );
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  `cd contracts/escrow && cargo test cancel_refunds_all_players`
  Expected: `ok. 1 passed`. Also re-run `cargo test join_rejects_after_cancel` from Task 3 (now `cancel_tournament` exists) — expect pass.

- [ ] **Step 5: Write failing tests for cancel reverts.**
  Add to `test.rs`:
  ```rust
  #[test]
  #[should_panic(expected = "Error(Contract, #7)")] // AlreadyFinished → no cancel after finalize
  fn cancel_rejects_after_finalize() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      escrow.finalize_results(&p1, &p2, &p3);
      escrow.cancel_tournament(); // finished → panic #7
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #8)")] // AlreadyCancelled
  fn cancel_rejects_double_cancel() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      escrow.cancel_tournament();
      escrow.cancel_tournament(); // second → panic #8
  }

  #[test]
  #[should_panic(expected = "Error(Contract, #8)")] // AlreadyCancelled → no finalize after cancel
  fn finalize_rejects_after_cancel() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      escrow.cancel_tournament();
      escrow.finalize_results(&p1, &p2, &p3); // cancelled → panic #8
  }

  #[test]
  #[should_panic] // unauthorized: only organizer may cancel
  fn cancel_requires_organizer_auth() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, _sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      env.set_auths(&[]); // clear mocked auths → organizer.require_auth() fails
      escrow.cancel_tournament();
  }
  ```

- [ ] **Step 6: Run, expect PASS.**
  `cd contracts/escrow && cargo test cancel && cargo test finalize_rejects_after_cancel && cargo test join_rejects_after_cancel`
  Expected: all pass.

- [ ] **Step 7: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: cancel_tournament refunds + single-shot reverts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 9: Event assertions (registered / finalized / cancelled)

**Files:** Test `contracts/escrow/src/test.rs` (impl already emits in Tasks 3/4/8)

**Interfaces:**
Consumes: `env.events().all()` to assert exact event shapes the Phase 5 subscriber depends on.
Verifies event shapes: `registered → topics (symbol "registered", player), data pool_after: i128`; `finalized → topics (symbol "finalized", first, second, third), data amounts: Vec<i128>`; `cancelled → topics (symbol "cancelled"), data refunded_count: u32`.

- [ ] **Step 1: Write failing test for the `registered` event shape.**
  Add to `test.rs`:
  ```rust
  use soroban_sdk::symbol_short;

  #[test]
  fn join_emits_registered_event() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let player = Address::generate(&env);
      sac.mint(&player, &5_000_000i128);
      escrow.join_tournament(&player);

      let events = env.events().all();
      // Filter to events emitted by the escrow contract.
      let mut found = false;
      for (contract_id, topics, data) in events.iter() {
          if contract_id == escrow.address {
              let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
              if topic0 == symbol_short!("registered") {
                  let player_topic: Address = topics.get(1).unwrap().into_val(&env);
                  let pool_after: i128 = data.into_val(&env);
                  assert_eq!(player_topic, player);
                  assert_eq!(pool_after, 1_000_000i128);
                  found = true;
              }
          }
      }
      assert!(found, "registered event not emitted");
  }
  ```
  Note: `env.events().all()` returns a `Vec<(Address, Vec<Val>, Val)>`; topics/data are `Val` and need `into_val(&env)` to typed values. The token SAC also emits its own transfer events — filter on `contract_id == escrow.address`.

- [ ] **Step 2: Run, expect PASS (emission added in Task 3).**
  `cd contracts/escrow && cargo test join_emits_registered_event`
  Expected: `ok. 1 passed`. If it fails on event shape, fix the `publish(...)` topics/data in `join_tournament` to match.

- [ ] **Step 3: Write failing tests for `finalized` and `cancelled` event shapes.**
  Add to `test.rs`:
  ```rust
  #[test]
  fn finalize_emits_finalized_event() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let p1 = join(&env, &escrow, &sac);
      let p2 = join(&env, &escrow, &sac);
      let p3 = join(&env, &escrow, &sac);
      escrow.finalize_results(&p1, &p2, &p3);

      let events = env.events().all();
      let mut found = false;
      for (contract_id, topics, data) in events.iter() {
          if contract_id == escrow.address {
              let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
              if topic0 == symbol_short!("finalized") {
                  let first: Address = topics.get(1).unwrap().into_val(&env);
                  let amounts: Vec<i128> = data.into_val(&env);
                  assert_eq!(first, p1);
                  assert_eq!(amounts.len(), 3);
                  assert_eq!(amounts.get(0).unwrap(), 1_800_000i128);
                  found = true;
              }
          }
      }
      assert!(found, "finalized event not emitted");
  }

  #[test]
  fn cancel_emits_cancelled_event() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, _token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      init_default(&env, &escrow, &token_addr, &organizer, &referee);
      let _p1 = join(&env, &escrow, &sac);
      let _p2 = join(&env, &escrow, &sac);
      escrow.cancel_tournament();

      let events = env.events().all();
      let mut found = false;
      for (contract_id, topics, data) in events.iter() {
          if contract_id == escrow.address {
              let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().into_val(&env);
              if topic0 == symbol_short!("cancelled") {
                  let count: u32 = data.into_val(&env);
                  assert_eq!(count, 2u32);
                  found = true;
              }
          }
      }
      assert!(found, "cancelled event not emitted");
  }
  ```

- [ ] **Step 4: Run, expect PASS.**
  `cd contracts/escrow && cargo test _event`
  Expected: all three event tests pass.

- [ ] **Step 5: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: assert registered/finalized/cancelled event shapes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 10: Deterministic rounding / dust → 1st place

**Files:** Test `contracts/escrow/src/test.rs` (dust logic already in Task 4)

**Interfaces:**
Consumes: `finalize_results` dust handling. Verifies: when `pool` is not divisible by the bps, the remainder is assigned to 1st place and `sum(payouts) == pool` exactly.

- [ ] **Step 1: Write failing test with a pool that leaves a remainder.**
  Add to `test.rs`. Use an `entry_fee` and player count making `pool * bps / 10000` non-integral. With bps [6000,3000,1000] and `pool = 3` (e.g. entry_fee = 1, 3 players): 60% of 3 = 1 (rem 0.8 lost), 30% = 0, 10% = 0 → distributed 1, dust 2 → 1st gets 1+2=3.
  ```rust
  #[test]
  fn finalize_assigns_dust_to_first_and_conserves_pool() {
      let env = Env::default();
      env.mock_all_auths();
      let admin = Address::generate(&env);
      let (token_addr, sac, token) = create_token(&env, &admin);
      let organizer = Address::generate(&env);
      let referee = Address::generate(&env);
      let escrow = create_escrow(&env);
      // entry_fee = 1 (smallest unit), 3 players → pool = 3, indivisible by bps.
      escrow.initialize(&organizer, &referee, &token_addr, &1i128, &bps(&env));

      let p1 = { let p = Address::generate(&env); sac.mint(&p, &100i128); escrow.join_tournament(&p); p };
      let p2 = { let p = Address::generate(&env); sac.mint(&p, &100i128); escrow.join_tournament(&p); p };
      let p3 = { let p = Address::generate(&env); sac.mint(&p, &100i128); escrow.join_tournament(&p); p };

      assert_eq!(escrow.get_pool(), 3i128);
      escrow.finalize_results(&p1, &p2, &p3);

      // floor(3*6000/10000)=1, floor(3*3000/10000)=0, floor(3*1000/10000)=0
      // distributed = 1; dust = 2; 1st = 1+2 = 3.
      let r1 = escrow.get_reward(&p1);
      let r2 = escrow.get_reward(&p2);
      let r3 = escrow.get_reward(&p3);
      assert_eq!(r1, 3i128);
      assert_eq!(r2, 0i128);
      assert_eq!(r3, 0i128);
      // Conservation: payouts sum to pool, escrow fully drained.
      assert_eq!(r1 + r2 + r3, 3i128);
      assert_eq!(token.balance(&escrow.address), 0i128);
      assert_eq!(token.balance(&p1), 100 - 1 + 3); // 102
      assert_eq!(token.balance(&p2), 100 - 1 + 0); // 99
      assert_eq!(token.balance(&p3), 100 - 1 + 0); // 99
  }
  ```

- [ ] **Step 2: Run, expect PASS (dust logic in Task 4).**
  `cd contracts/escrow && cargo test finalize_assigns_dust_to_first_and_conserves_pool`
  Expected: `ok. 1 passed`. If `r1 != 3` or escrow balance != 0, fix the dust block in `finalize_results` (`dust = pool - distributed; amounts[0] += dust`).

- [ ] **Step 3: Run the FULL suite green.**
  `cd contracts/escrow && cargo test`
  Expected: every test passes, e.g. `test result: ok. <N> passed; 0 failed`. This is the gate before build/upload.

- [ ] **Step 4: Commit.**
  `git add contracts/escrow && git commit -m "Phase 1: deterministic dust->1st, pool conservation test; full suite green

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

### Task 11: Build, upload, record WASM hash, generate TS bindings

**Files:** Modify `contracts/escrow/Cargo.toml` (none expected); produces `target/wasm32v1-none/release/ggg_escrow.wasm`, the recorded `ESCROW_WASM_HASH`, and `apps/web/src/contract-client/` bindings.

**Interfaces:**
Produces: the built WASM, its uploaded hash (for the `ESCROW_WASM_HASH` env in SPEC §14), and the TypeScript bindings Phase 2 consumes from `apps/web/src/contract-client`.
Consumes: the green contract from Tasks 1–10; `stellar-cli` 26.

- [ ] **Step 1: Verify toolchain.**
  `stellar --version && rustc --version && rustup target list --installed | grep wasm32v1-none`
  Expected: `stellar 26.x`, a stable rustc, and `wasm32v1-none` present. If the target is missing: `rustup target add wasm32v1-none`.

- [ ] **Step 2: Build the WASM.**
  `cd contracts/escrow && stellar contract build`
  Expected output: `... Compiling ggg-escrow ... Finished` and the artifact at `target/wasm32v1-none/release/ggg_escrow.wasm`. Confirm with `ls -la target/wasm32v1-none/release/ggg_escrow.wasm`.

- [ ] **Step 3 (optional but recommended): Optimize the WASM.**
  `cd contracts/escrow && stellar contract optimize --wasm target/wasm32v1-none/release/ggg_escrow.wasm`
  Expected: produces `ggg_escrow.optimized.wasm`; note the smaller size. Use the optimized file in subsequent steps if produced.

- [ ] **Step 4: Ensure a funded Testnet identity exists.**
  `stellar keys generate --global ggg-deployer --network testnet --fund || stellar keys address ggg-deployer`
  Expected: prints a `G...` address; `--fund` uses Friendbot on Testnet. If already created, the fallback prints the existing address.

- [ ] **Step 5: Upload the WASM and record the hash.**
  `cd contracts/escrow && stellar contract upload --wasm target/wasm32v1-none/release/ggg_escrow.wasm --source ggg-deployer --network testnet`
  Expected output: a 64-hex-character WASM hash printed on its own line. Capture it. Record it into the env example so Phase 2/4 can deploy by hash:
  - Append/update `ESCROW_WASM_HASH=<that hash>` in `apps/web/.env.example` (if Phase 0 created it) or note it in the commit message. The plan requires it recorded for the `ESCROW_WASM_HASH` env key from SPEC §14.

- [ ] **Step 6: Generate TypeScript bindings into `apps/web/src/contract-client`.**
  `mkdir -p apps/web/src/contract-client`
  `stellar contract bindings typescript --wasm contracts/escrow/target/wasm32v1-none/release/ggg_escrow.wasm --output-dir apps/web/src/contract-client --overwrite`
  Note: SPEC §4 references `npx @stellar/stellar-sdk generate ...`; the canonical stellar-cli 26 command is `stellar contract bindings typescript`. Use the CLI command (same toolchain pinned in §2). If the installed CLI uses different flags, run `stellar contract bindings typescript --help` and adapt `--wasm`/`--output-dir`/`--overwrite`/`--contract-name ggg-escrow` accordingly.
  Expected: a generated TS package under `apps/web/src/contract-client` (a `Client` class exposing typed `initialize`, `join_tournament`, `finalize_results`, `get_pool`, `get_reward`, `is_finished`, `cancel_tournament`). Confirm with `ls apps/web/src/contract-client`.

- [ ] **Step 7: Final verification.**
  `cd contracts/escrow && cargo test && echo "WASM:" && ls -la target/wasm32v1-none/release/ggg_escrow.wasm && echo "BINDINGS:" && ls ../../apps/web/src/contract-client`
  Expected: `cargo test` fully green, WASM present, bindings directory populated.

- [ ] **Step 8: Commit.**
  `git add contracts/escrow apps/web/src/contract-client apps/web/.env.example 2>/dev/null; git add contracts/escrow apps/web/src/contract-client && git commit -m "Phase 1: build WASM, upload (hash recorded), generate TS bindings

WASM hash recorded for ESCROW_WASM_HASH (SPEC §14).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J4RqTwxzJMd6fyVL1UeqV8"`

---

## Self-review (SPEC §4 + AGENT §6 coverage)

**Functions** — `initialize` (T2), `join_tournament` (T3), `finalize_results` (T4), `get_pool` (T2/T5), `get_reward` (T6), `is_finished` (T2/T7), `cancel_tournament` (T8). All seven present with the exact cross-phase signatures.

**Storage/state** — organizer, referee, token, entry_fee, distribution_bps, players, finished, cancelled, winners — all in `DataKey` (T1) and written in T2/T3/T4/T8.

**Events** — `registered (player, pool_after)` (T3, asserted T9), `finalized (first, second, third, amounts)` (T4, asserted T9), `cancelled (refunded_count)` (T8, asserted T9). Shapes match the cross-phase contract.

**Security invariants** — organizer-only initialize/cancel (T2/T8 auth tests); referee-only finalize (T4 auth test); funds exit only via payout/refund, no withdraw fn (structural — no such fn exists); single-shot finalize/cancel (T4/T8 double + cross reverts); join dedupe (T3); winners distinct+registered (T4); reject join after finished/cancelled (T4/T3); checked i128 arithmetic everywhere (T2/T3/T4/T6); deterministic dust→1st with pool conservation (T4 logic, T10 test).

**Required revert tests** — unauthorized initialize/finalize/cancel; double-finalize; finalize-after-cancel; cancel-after-finalize; unregistered winner; duplicate winner; bad bps len; bad bps sum; entry_fee<=0; organizer==referee; join after finished; join after cancelled; double-join; double-cancel — all enumerated across T2/T3/T4/T8.

**Build/bindings flow** — build (T11.2), upload + hash record for `ESCROW_WASM_HASH` (T11.5), TS bindings into `apps/web/src/contract-client` (T11.6), full-suite gate (T10.3 + T11.7).

**Notes/assumptions resolved inline:** (1) `get_pool` defined as `players.len() * entry_fee` per SPEC ("or the contract's actual token balance" — the player-count form is deterministic and used consistently by `finalize`/`get_reward`). (2) Stub-then-confirm pattern for `get_pool`/`is_finished` keeps the file single and tasks additive; flagged in T2. (3) `set_auths(&[])` is used to force auth-failure tests; if the pinned SDK 26 differs, the inline note gives the `mock_auths` alternative — no placeholder. (4) Bindings command uses canonical `stellar contract bindings typescript` (stellar-cli 26) rather than the SPEC's older `npx ... generate` phrasing, with a `--help` fallback note.

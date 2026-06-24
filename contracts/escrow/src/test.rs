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
fn create_escrow(env: &Env) -> EscrowClient<'_> {
    let id = env.register(Escrow, ());
    EscrowClient::new(env, &id)
}

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


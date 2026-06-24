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

#[test]
fn crate_compiles() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let (_token_addr, _sac, _token) = create_token(&env, &admin);
    let _escrow = create_escrow(&env);
}

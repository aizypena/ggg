#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token, Address, Env, Symbol, Vec};

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

#[contractimpl]
impl Escrow {
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
            (Symbol::new(&env, "registered"), player),
            pool_after,
        );
    }
}

#[cfg(test)]
mod test;

#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Vec};

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
}

#[cfg(test)]
mod test;

#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Vec};

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
    // methods added in Tasks 2–8
}

#[cfg(test)]
mod test;

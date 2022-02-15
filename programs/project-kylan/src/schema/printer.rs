use anchor_lang::prelude::*;

#[account]
pub struct Printer {
  pub stable_token: Pubkey,
  pub authority: Pubkey,
}

impl Printer {
  pub const LEN: usize = 8 + 32 + 32;
}

use anchor_lang::prelude::*;

#[account]
pub struct Cheque {
  pub amount: u64,
  pub printer: Pubkey,
  pub secure_token: Pubkey,
  pub authority: Pubkey,
}

impl Cheque {
  pub const LEN: usize = 8 + 8 + 32 + 32 + 32;
  // Add to the cheque
  pub fn add(&mut self, amount: u64) -> Option<u64> {
    let _amount = self.amount.checked_add(amount)?;
    self.amount = _amount;
    Some(_amount)
  }
  // Subtract from the cheque
  pub fn sub(&mut self, amount: u64) -> Option<u64> {
    if self.amount < amount {
      return None;
    }
    let _amount = self.amount.checked_sub(amount)?;
    self.amount = _amount;
    Some(_amount)
  }
}

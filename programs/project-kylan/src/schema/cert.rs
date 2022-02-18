use anchor_lang::prelude::*;
use num_traits::ToPrimitive;

///
/// Cert state
///
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq)]
pub enum CertState {
  Uninitialized,
  Active,
  PrintOnly,
  BurnOnly,
  Paused,
}
impl Default for CertState {
  fn default() -> Self {
    CertState::Uninitialized
  }
}

/**
 * 1 stable_token = price / 10**6 * 1 secure_token
 */
#[account]
pub struct Cert {
  pub printer: Pubkey,
  pub secure_token: Pubkey,
  pub price: u64,     // decimals 6
  pub fee: u64,       // decimals 6
  pub taxman: Pubkey, // Associated account of the secure token for taxman
  pub state: CertState,
}

impl Cert {
  pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 32 + 1;
  pub const PRECISION: u128 = 1_000_000;
  // Check the cert state is available to print
  pub fn is_printable(&self) -> bool {
    if self.state == CertState::Active || self.state == CertState::PrintOnly {
      true
    } else {
      false
    }
  }
  // Check the cert state is available to burn
  pub fn is_burnable(&self) -> bool {
    if self.state == CertState::Active || self.state == CertState::BurnOnly {
      true
    } else {
      false
    }
  }
  // Compute corresponding printable amount
  pub fn printable_amount(&self, staked_amount: u64) -> Option<u64> {
    return staked_amount
      .to_u128()?
      .checked_mul(self.price.to_u128()?)?
      .checked_div(Cert::PRECISION.to_u128()?)?
      .to_u64();
  }
  // Compute corresponding burnable amount
  pub fn burnable_amount(&self, unstaked_amount: u64) -> Option<(u64, u64)> {
    let amount = unstaked_amount
      .to_u128()?
      .checked_mul(Cert::PRECISION)?
      .checked_div(self.price.to_u128()?)?
      .to_u64()?;
    let chargeable = amount
      .to_u128()?
      .checked_mul(self.fee.to_u128()?)?
      .checked_div(Cert::PRECISION)?
      .to_u64()?;
    let burnable = amount.checked_sub(chargeable)?;
    Some((burnable, chargeable))
  }
}

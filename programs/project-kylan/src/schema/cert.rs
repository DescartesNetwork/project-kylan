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
 * rate = numerator_rate / denominator_rate
 * 1 stable = rate * security
 */
#[account]
pub struct Cert {
  pub printer: Pubkey,
  pub secure_token: Pubkey,
  pub numerator_rate: u64,
  pub denominator_rate: u64,
  pub state: CertState,
}

impl Cert {
  pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1;
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
      .checked_mul(self.numerator_rate.to_u128()?)?
      .checked_div(self.denominator_rate.to_u128()?)?
      .to_u64();
  }
  // Compute corresponding burnable amount
  pub fn burnable_amount(&self, unstaked_amount: u64) -> Option<u64> {
    return unstaked_amount
      .to_u128()?
      .checked_mul(self.denominator_rate.to_u128()?)?
      .checked_div(self.numerator_rate.to_u128()?)?
      .to_u64();
  }
}

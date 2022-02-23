use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
  #[msg("Operation overflowed")]
  Overflow,
  #[msg("Cannot set the cert to uninitialized")]
  UninitializedCert,
  #[msg("The token isn't available to print")]
  NotPrintable,
  #[msg("The token isn't available to burn")]
  NotBurnable,
}

use crate::errors::ErrorCode;
use crate::schema::{cert::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::token;

#[derive(Accounts)]
pub struct SetCertState<'info> {
  pub stable_token: Account<'info, token::Mint>,
  pub secure_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(has_one = authority)]
  pub printer: Account<'info, Printer>,
  #[account(mut, has_one = printer, has_one = secure_token)]
  pub cert: Account<'info, Cert>,
}

pub fn exec(ctx: Context<SetCertState>, state: CertState) -> Result<()> {
  let cert = &mut ctx.accounts.cert;
  if state == CertState::Uninitialized {
    return Err(error!(ErrorCode::UninitializedCert));
  }
  cert.state = state;
  Ok(())
}

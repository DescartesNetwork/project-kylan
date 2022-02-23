use crate::schema::{cert::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::token;

#[derive(Accounts)]
pub struct SetCertFee<'info> {
  pub stable_token: Account<'info, token::Mint>,
  pub secure_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(has_one = authority)]
  pub printer: Account<'info, Printer>,
  #[account(mut, has_one = printer, has_one = secure_token)]
  pub cert: Account<'info, Cert>,
}

pub fn exec(ctx: Context<SetCertFee>, fee: u64) -> Result<()> {
  let cert = &mut ctx.accounts.cert;
  cert.fee = fee;
  Ok(())
}

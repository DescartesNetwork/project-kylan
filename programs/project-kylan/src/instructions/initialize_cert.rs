use crate::schema::{cert::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::token;

#[derive(Accounts)]
pub struct InitializeCert<'info> {
  pub stable_token: Account<'info, token::Mint>,
  pub secure_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(has_one = authority)]
  pub printer: Account<'info, Printer>,
  #[account(
    init,
    payer = authority,
    space = Cert::LEN,
    seeds = [
      b"cert".as_ref(),
      &printer.key().to_bytes(),
      &secure_token.key().to_bytes(),
    ],
    bump
  )]
  pub cert: Account<'info, Cert>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn exec(
  ctx: Context<InitializeCert>,
  numerator_rate: u64,
  denominator_rate: u64,
) -> ProgramResult {
  let cert = &mut ctx.accounts.cert;
  cert.printer = ctx.accounts.printer.key();
  cert.secure_token = ctx.accounts.secure_token.key();
  cert.numerator_rate = numerator_rate;
  cert.denominator_rate = denominator_rate;
  cert.state = CertState::Active;
  Ok(())
}

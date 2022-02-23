use crate::schema::{cert::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token};

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
  #[account(
    init_if_needed,
    payer = authority,
    associated_token::mint = secure_token,
    associated_token::authority = taxman_authority
  )]
  pub taxman: Account<'info, token::TokenAccount>,
  pub taxman_authority: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, token::Token>,
  pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn exec(ctx: Context<InitializeCert>, price: u64, fee: u64) -> Result<()> {
  let cert = &mut ctx.accounts.cert;
  cert.printer = ctx.accounts.printer.key();
  cert.secure_token = ctx.accounts.secure_token.key();
  cert.price = price;
  cert.fee = fee;
  cert.taxman = ctx.accounts.taxman.key();
  cert.state = CertState::Active;
  Ok(())
}

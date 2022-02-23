use crate::schema::{cert::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token};

#[derive(Accounts)]
pub struct SetCertTaxman<'info> {
  pub stable_token: Account<'info, token::Mint>,
  pub secure_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(has_one = authority)]
  pub printer: Account<'info, Printer>,
  #[account(mut, has_one = printer, has_one = secure_token)]
  pub cert: Account<'info, Cert>,
  #[account(
    init_if_needed,
    payer = authority,
    associated_token::mint = secure_token,
    associated_token::authority = taxman_authority
  )]
  pub taxman: Account<'info, token::TokenAccount>,
  pub taxman_authority: AccountInfo<'info>,
  pub token_program: Program<'info, token::Token>,
  pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
  pub rent: Sysvar<'info, Rent>,
  pub system_program: Program<'info, System>,
}

pub fn exec(ctx: Context<SetCertTaxman>) -> Result<()> {
  let cert = &mut ctx.accounts.cert;
  cert.taxman = ctx.accounts.taxman.key();
  Ok(())
}

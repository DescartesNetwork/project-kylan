use crate::schema::{cheque::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::token;

#[derive(Accounts)]
pub struct InitializeCheque<'info> {
  pub stable_token: Account<'info, token::Mint>,
  pub secure_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(has_one = authority)]
  pub printer: Account<'info, Printer>,
  #[account(
    init,
    payer = authority,
    space = Cheque::LEN,
    seeds = [
      b"cheque".as_ref(),
      &printer.key().to_bytes(),
      &secure_token.key().to_bytes(),
      &authority.key().to_bytes(),
    ],
    bump
  )]
  pub cheque: Account<'info, Cheque>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn exec(ctx: Context<InitializeCheque>) -> ProgramResult {
  let cheque = &mut ctx.accounts.cheque;
  cheque.amount = 0;
  cheque.printer = ctx.accounts.printer.key();
  cheque.secure_token = ctx.accounts.secure_token.key();
  cheque.authority = ctx.accounts.authority.key();
  Ok(())
}

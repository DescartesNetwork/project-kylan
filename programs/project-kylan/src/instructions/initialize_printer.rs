use anchor_lang::prelude::*;
use anchor_spl::token;
use crate::schema::printer;

#[derive(Accounts)]
#[instruction(_decimals: u8)]
pub struct InitializeStableToken<'info> {
  #[account(
    init, 
    payer = authority,
    mint::decimals = _decimals,
    mint::authority = treasurer, 
    mint::freeze_authority = treasurer)]
  pub stable_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(seeds = [&stable_token.key().to_bytes()], bump)]
  pub treasurer: AccountInfo<'info>,
  #[account(init, payer = authority, space = printer::Printer::LEN)]
  pub printer: Account<'info, printer::Printer>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, token::Token>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn exec(ctx: Context<InitializeStableToken>, _decimals: u8) -> ProgramResult {
  let printer = &mut ctx.accounts.printer;
  printer.stable_token = ctx.accounts.stable_token.key();
  printer.authority = ctx.accounts.authority.key();
  Ok(())
}

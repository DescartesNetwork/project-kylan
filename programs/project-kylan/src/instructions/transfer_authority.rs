use crate::schema::printer;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
  #[account(mut)]
  pub authority: Signer<'info>,
  /// CHECK: Just a pure account
  pub new_authority: AccountInfo<'info>,
  #[account(mut, has_one = authority)]
  pub printer: Account<'info, printer::Printer>,
}

pub fn exec(ctx: Context<TransferAuthority>) -> Result<()> {
  let printer = &mut ctx.accounts.printer;
  printer.authority = ctx.accounts.new_authority.key();
  Ok(())
}

use crate::errors::ErrorCode;
use crate::schema::{cert::*, cheque::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token};

#[derive(Accounts)]
pub struct Print<'info> {
  #[account(mut)]
  pub stable_token: Account<'info, token::Mint>,
  pub secure_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(seeds = [&stable_token.key().to_bytes()], bump)]
  pub treasurer: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = authority,
    associated_token::mint = secure_token,
    associated_token::authority = treasurer
  )]
  pub treasury: Account<'info, token::TokenAccount>,
  #[account(mut)]
  pub src_associated_token_account: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = authority,
    associated_token::mint = stable_token,
    associated_token::authority = authority
  )]
  pub dst_associated_token_account: Account<'info, token::TokenAccount>,
  #[account(has_one = stable_token)]
  pub printer: Box<Account<'info, Printer>>,
  #[account(has_one = printer, has_one = secure_token)]
  pub cert: Box<Account<'info, Cert>>,
  #[account(mut, has_one = printer, has_one = secure_token, has_one = authority)]
  pub cheque: Box<Account<'info, Cheque>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, token::Token>,
  pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn exec(ctx: Context<Print>, amount: u64) -> ProgramResult {
  if !ctx.accounts.cert.is_printable() {
    return Err(ErrorCode::NotPrintable.into());
  }
  // Stake secure tokens
  let transfer_ctx = CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    token::Transfer {
      from: ctx.accounts.src_associated_token_account.to_account_info(),
      to: ctx.accounts.treasury.to_account_info(),
      authority: ctx.accounts.authority.to_account_info(),
    },
  );
  token::transfer(transfer_ctx, amount)?;
  // Print stable tokens
  let seeds: &[&[&[u8]]] = &[&[
    &ctx.accounts.stable_token.key().to_bytes(),
    &[*ctx.bumps.get("treasurer").unwrap()],
  ]];
  let printable_amount = ctx
    .accounts
    .cert
    .printable_amount(amount)
    .ok_or(ErrorCode::Overflow)?;
  let mint_to_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    token::MintTo {
      to: ctx.accounts.dst_associated_token_account.to_account_info(),
      mint: ctx.accounts.stable_token.to_account_info(),
      authority: ctx.accounts.treasurer.to_account_info(),
    },
    seeds,
  );
  token::mint_to(mint_to_ctx, printable_amount)?;
  // Build the cheque
  let cheque = &mut ctx.accounts.cheque;
  cheque.add(printable_amount).ok_or(ErrorCode::Overflow)?;
  Ok(())
}

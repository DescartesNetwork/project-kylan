use crate::errors::ErrorCode;
use crate::schema::{cert::*, cheque::*, printer::*};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token, token};

#[derive(Accounts)]
pub struct Burn<'info> {
  #[account(mut)]
  pub stable_token: Account<'info, token::Mint>,
  pub secure_token: Account<'info, token::Mint>,
  #[account(mut)]
  pub authority: Signer<'info>,
  #[account(seeds = [&stable_token.key().to_bytes()], bump)]
  pub treasurer: AccountInfo<'info>,
  #[account(mut)]
  pub treasury: Account<'info, token::TokenAccount>,
  #[account(mut)]
  pub src_associated_token_account: AccountInfo<'info>,
  #[account(
    init_if_needed,
    payer = authority,
    associated_token::mint = secure_token,
    associated_token::authority = authority
  )]
  pub dst_associated_token_account: Account<'info, token::TokenAccount>,
  #[account(has_one = stable_token)]
  pub printer: Box<Account<'info, Printer>>,
  #[account(has_one = printer, has_one = secure_token, has_one = taxman)]
  pub cert: Box<Account<'info, Cert>>,
  #[account(mut, has_one = printer, has_one = secure_token, has_one = authority)]
  pub cheque: Box<Account<'info, Cheque>>,
  #[account(mut)]
  pub taxman: Box<Account<'info, token::TokenAccount>>,
  pub system_program: Program<'info, System>,
  pub token_program: Program<'info, token::Token>,
  pub associated_token_program: Program<'info, associated_token::AssociatedToken>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn exec(ctx: Context<Burn>, amount: u64) -> ProgramResult {
  if !ctx.accounts.cert.is_burnable() {
    return Err(ErrorCode::NotBurnable.into());
  }
  // Burn stable tokens
  let burn_ctx = CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    token::Burn {
      to: ctx.accounts.src_associated_token_account.to_account_info(),
      mint: ctx.accounts.stable_token.to_account_info(),
      authority: ctx.accounts.authority.to_account_info(),
    },
  );
  token::burn(burn_ctx, amount)?;
  // Build the cheque
  let cheque = &mut ctx.accounts.cheque;
  cheque.sub(amount).ok_or(ErrorCode::Overflow)?;
  // Unstake secure tokens
  let seeds: &[&[&[u8]]] = &[&[
    &ctx.accounts.stable_token.key().to_bytes(),
    &[*ctx.bumps.get("treasurer").unwrap()],
  ]];
  let (burnable_amount, chargeable_amount) = ctx
    .accounts
    .cert
    .burnable_amount(amount)
    .ok_or(ErrorCode::Overflow)?;
  // Transfer fee
  let fee_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    token::Transfer {
      from: ctx.accounts.treasury.to_account_info(),
      to: ctx.accounts.taxman.to_account_info(),
      authority: ctx.accounts.treasurer.to_account_info(),
    },
    seeds,
  );
  token::transfer(fee_ctx, chargeable_amount)?;
  // Transfer secure tokens
  let transfer_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    token::Transfer {
      from: ctx.accounts.treasury.to_account_info(),
      to: ctx.accounts.dst_associated_token_account.to_account_info(),
      authority: ctx.accounts.treasurer.to_account_info(),
    },
    seeds,
  );
  token::transfer(transfer_ctx, burnable_amount)?;
  Ok(())
}

use anchor_lang::prelude::*;

pub mod errors;
pub use errors::*;
pub mod schema;
pub use schema::*;
pub mod instructions;
pub use instructions::*;

declare_id!("57bCSmBzSiVyZEDb8n8W33tyxAcqDCcVnkb1eJ2jfnmP");

#[program]
mod project_kylan {
  use super::*;

  pub fn initialize_printer(ctx: Context<InitializeStableToken>, decimals: u8) -> ProgramResult {
    initialize_printer::exec(ctx, decimals)
  }

  pub fn initialize_cert(ctx: Context<InitializeCert>, price: u64, fee: u64) -> ProgramResult {
    initialize_cert::exec(ctx, price, fee)
  }

  pub fn initialize_cheque(ctx: Context<InitializeCheque>) -> ProgramResult {
    initialize_cheque::exec(ctx)
  }

  pub fn print(ctx: Context<Print>, amount: u64) -> ProgramResult {
    print::exec(ctx, amount)
  }

  pub fn burn(ctx: Context<Burn>, amount: u64) -> ProgramResult {
    burn::exec(ctx, amount)
  }

  pub fn set_cert_state(ctx: Context<SetCertState>, state: CertState) -> ProgramResult {
    set_cert_state::exec(ctx, state)
  }

  pub fn set_cert_fee(ctx: Context<SetCertFee>, fee: u64) -> ProgramResult {
    set_cert_fee::exec(ctx, fee)
  }

  pub fn set_cert_taxman(ctx: Context<SetCertTaxman>) -> ProgramResult {
    set_cert_taxman::exec(ctx)
  }
}

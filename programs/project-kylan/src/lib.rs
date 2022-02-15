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

  pub fn initialize_cert(
    ctx: Context<InitializeCert>,
    numerator_rate: u64,
    denominator_rate: u64,
  ) -> ProgramResult {
    initialize_cert::exec(ctx, numerator_rate, denominator_rate)
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
}

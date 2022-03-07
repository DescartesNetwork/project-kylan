use anchor_lang::prelude::*;

pub mod errors;
pub use errors::*;
pub mod schema;
pub use schema::*;
pub mod instructions;
pub use instructions::*;

declare_id!("BtWSjF2dpLAPLbCJjyXLZJJPaWbZhpyT2Z8A2yg5Aozj");

#[program]
mod project_kylan {
  use super::*;

  pub fn initialize_printer(ctx: Context<InitializePrinter>, decimals: u8) -> Result<()> {
    initialize_printer::exec(ctx, decimals)
  }

  pub fn initialize_cert(ctx: Context<InitializeCert>, rate: u64, fee: u64) -> Result<()> {
    initialize_cert::exec(ctx, rate, fee)
  }

  pub fn initialize_cheque(ctx: Context<InitializeCheque>) -> Result<()> {
    initialize_cheque::exec(ctx)
  }

  pub fn print(ctx: Context<Print>, amount: u64) -> Result<()> {
    print::exec(ctx, amount)
  }

  pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
    burn::exec(ctx, amount)
  }

  pub fn set_cert_state(ctx: Context<SetCertState>, state: CertState) -> Result<()> {
    set_cert_state::exec(ctx, state)
  }

  pub fn set_cert_fee(ctx: Context<SetCertFee>, fee: u64) -> Result<()> {
    set_cert_fee::exec(ctx, fee)
  }

  pub fn set_cert_taxman(ctx: Context<SetCertTaxman>) -> Result<()> {
    set_cert_taxman::exec(ctx)
  }

  pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
    transfer_authority::exec(ctx)
  }
}

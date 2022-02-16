import { web3, Program, Provider, Wallet, utils } from '@project-serum/anchor'
import { ProjectKylan } from '../target/types/project_kylan'

import {
  DEFAULT_RPC_ENDPOINT,
  DEFAULT_KYLAN_PROGRAM_ID,
  DEFAULT_KYLAN_IDL,
} from './constant'
import { findCert, isAddress } from './utils'

class Kylan {
  private _connection: web3.Connection
  private _provider: Provider
  readonly program: Program<ProjectKylan>

  constructor(
    wallet: Wallet,
    rpcEndpoint: string = DEFAULT_RPC_ENDPOINT,
    programId: string = DEFAULT_KYLAN_PROGRAM_ID,
  ) {
    if (!isAddress(programId)) throw new Error('Invalid program id')
    // Private
    this._connection = new web3.Connection(rpcEndpoint, 'confirmed')
    this._provider = new Provider(this._connection, wallet, {
      skipPreflight: true,
      commitment: 'confirmed',
    })
    // Public
    this.program = new Program<ProjectKylan>(
      DEFAULT_KYLAN_IDL,
      programId,
      this._provider,
    )
  }

  deriveCertAddress = async (
    printerAddress: string,
    secureTokenAddress: string,
  ) => {
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    const certPublickKey = await findCert(
      new web3.PublicKey(printerAddress),
      new web3.PublicKey(secureTokenAddress),
      this.program.programId,
    )
    return certPublickKey.toBase58()
  }

  deriveTreasurer = async (secureTokenAddress: string) => {
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    const stableTokenPublicKey = new web3.PublicKey(secureTokenAddress)
    const [treasurerPublicKey] = await web3.PublicKey.findProgramAddress(
      [stableTokenPublicKey.toBuffer()],
      this.program.programId,
    )
    return treasurerPublicKey.toBase58()
  }

  initializePrinter = async (
    secureTokenAddress: string,
    printer: web3.Keypair = web3.Keypair.generate(),
    decimals: number = 6,
    stableToken: web3.Keypair = web3.Keypair.generate(),
  ) => {
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    const secureToken = new web3.PublicKey(secureTokenAddress)
    const treasurerAddress = await this.deriveTreasurer(secureTokenAddress)
    const treasurerPublicKey = new web3.PublicKey(treasurerAddress)
    const txId = this.program.rpc.initializePrinter(decimals, {
      accounts: {
        stableToken: stableToken.publicKey,
        secureToken,
        authority: this._provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        treasurer: treasurerPublicKey,
        printer: printer.publicKey,
      },
      signers: [stableToken, printer],
    })
    return {
      txId,
      printerAddress: printer.publicKey.toBase58(),
      stableTokenAddress: stableToken.publicKey.toBase58(),
      treasurerAddress,
    }
  }
}

export * from '../target/types/project_kylan'
export * from './constant'
export * from './utils'
export default Kylan

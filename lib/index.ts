import {
  web3,
  Program,
  Provider,
  Wallet,
  utils,
  BN,
} from '@project-serum/anchor'
import { TypeDef } from '@project-serum/anchor/dist/cjs/program/namespace/types'
import { ProjectKylan } from '../target/types/project_kylan'

import {
  DEFAULT_RPC_ENDPOINT,
  DEFAULT_KYLAN_PROGRAM_ID,
  DEFAULT_KYLAN_IDL,
} from './constant'
import { findCert, isAddress } from './utils'

export type PrinterData = TypeDef<ProjectKylan['accounts'][1], ProjectKylan>
export type CertData = TypeDef<ProjectKylan['accounts'][0], ProjectKylan>
type Uninitialized = { uninitialized: {} }
type Active = { active: {} }
type PrintOnly = { printOnly: {} }
type BurnOnly = { burnOnly: {} }
type Paused = { paused: {} }
export type CertState = Uninitialized | Active | PrintOnly | BurnOnly | Paused
export const CertStates: Record<string, CertState> = {
  Uninitialized: { uninitialized: {} },
  Active: { active: {} },
  PrintOnly: { printOnly: {} },
  BurnOnly: { burnOnly: {} },
  Paused: { paused: {} },
}

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

  /**
   * Parse printer buffer data.
   * @param data Printer buffer data.
   * @returns Printer readable data.
   */
  parsePrinterData = (data: Buffer): PrinterData => {
    return this.program.coder.accounts.decode('Printer', data)
  }

  /**
   * Get printer data.
   * @param printerAddress Printer address.
   * @returns Printer readable data.
   */
  getPrinterData = async (printerAddress: string): Promise<PrinterData> => {
    return this.program.account.printer.fetch(printerAddress)
  }

  /**
   * Parse certificate buffer data.
   * @param data Certificate buffer data.
   * @returns Certficate readable data.
   */
  parseCertData = (data: Buffer): PrinterData => {
    return this.program.coder.accounts.decode('cert', data)
  }

  /**
   * Get cert data.
   * @param certAddress Certificate address.
   * @returns Certficate readable data.
   */
  getCertData = async (certAddress: string): Promise<CertData> => {
    return this.program.account.cert.fetch(certAddress)
  }

  /**
   * Derive a certificate address by printer address and secure token address.
   * @param printerAddress Printer address.
   * @param secureTokenAddress Secure token address.
   * @param strict (Optional) if true, a validation process will activate to make sure the cert is safe.
   * @returns Certificate address.
   */
  deriveCertAddress = async (
    printerAddress: string,
    secureTokenAddress: string,
    strict: boolean = false,
  ) => {
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    const certPublickKey = await findCert(
      new web3.PublicKey(printerAddress),
      new web3.PublicKey(secureTokenAddress),
      this.program.programId,
    )
    const certAddress = certPublickKey.toBase58()

    if (strict) {
      let onchainSecureTokenAddress: string
      try {
        const { secureToken } = await this.getCertData(certAddress)
        onchainSecureTokenAddress = secureToken.toBase58()
      } catch (er) {
        throw new Error(
          `This secure token ${secureTokenAddress} is not in the whitelist of printer ${printerAddress}`,
        )
      }
      if (secureTokenAddress !== onchainSecureTokenAddress)
        throw new Error('Violated certificate')
    }

    return certAddress
  }

  /**
   * Derive treasurer address of a printer by stable token address.
   * @param stableTokenAddress Stable token address.
   * @returns Treasurer address that holds the secure token treasuries of the printer.
   */
  deriveTreasurerAddress = async (stableTokenAddress: string) => {
    if (!isAddress(stableTokenAddress))
      throw new Error('Invalid stable token address')
    const stableTokenPublicKey = new web3.PublicKey(stableTokenAddress)
    const [treasurerPublicKey] = await web3.PublicKey.findProgramAddress(
      [stableTokenPublicKey.toBuffer()],
      this.program.programId,
    )
    return treasurerPublicKey.toBase58()
  }

  /**
   * Initialize a printer. This printer will generate & manage a stable token.
   * After the init, the authority can add certificate to accept the pair of secure token & stable token.
   * An number of secure tokens, which is verified by a certificate, is locked in the printer, a corresponding number of stable tokens would be printed and sent back.
   * @param printer (Optional) The printer keypair. If it's not provided, a new one will be auto generated.
   * @param decimals (Optional) Decimals for the stable token. Default is 6.
   * @param stableToken (Optional) The stable token keypair. If it's not provided, a new one will be auto generated.
   * @returns { txId, printerAddress, stableTokenAddress }
   */
  initializePrinter = async (
    printer: web3.Keypair = web3.Keypair.generate(),
    decimals: number = 6,
    stableToken: web3.Keypair = web3.Keypair.generate(),
  ) => {
    const treasurerAddress = await this.deriveTreasurerAddress(
      stableToken.publicKey.toBase58(),
    )
    const treasurerPublicKey = new web3.PublicKey(treasurerAddress)
    const txId = await this.program.rpc.initializePrinter(decimals, {
      accounts: {
        stableToken: stableToken.publicKey,
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
    }
  }

  /**
   * Create a certificate that allows the printer could print/burn a new secure token.
   * The ratio between the stable and secure token is defined by numerator_rate and denominator_rate.
   * $1 = 1 Stable Token = numerator_rate / denominator_rate * secure_token_price
   * For example, if one secure token worths $0.75, then
   * 1 Stable Token = 4 / 3 * 0.75 so numerator_rate = 4 and denominator_rate = 3
   * @param printerAddress Printer address.
   * @param secureTokenAddress Secure token address.
   * @param numerator_rate Numerator of price rate.
   * @param denominator_rate Denominator of price rate. Default is 10^6.
   * @returns { txId, certAddress }
   */
  initializeCert = async (
    printerAddress: string,
    secureTokenAddress: string,
    numerator_rate: BN,
    denominator_rate: BN = new BN(10 ** 6),
  ) => {
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    if (
      numerator_rate.isZero() ||
      numerator_rate.isNeg() ||
      denominator_rate.isZero() ||
      denominator_rate.isNeg()
    )
      throw new Error(
        'The numerator and denominator should be greater than zero',
      )
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerAddress,
    )
    const certAddress = await this.deriveCertAddress(
      printerAddress,
      secureTokenAddress,
    )
    const txId = await this.program.rpc.initializeCert(
      numerator_rate,
      denominator_rate,
      {
        accounts: {
          stableToken: stableTokenPublicKey,
          secureToken: new web3.PublicKey(secureTokenAddress),
          authority: this.program.provider.wallet.publicKey,
          printer: new web3.PublicKey(printerAddress),
          cert: new web3.PublicKey(certAddress),
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        },
      },
    )
    return { txId, certAddress }
  }

  /**
   * Print stable tokens by staking a number of secure tokens.
   * The printed amount is computed by the predefined numerator & denominator rate of the certification of the secure token.
   * @param amount Staking amount.
   * @param secureTokenAddress Secure token address.
   * @param printerAddress Printer Address.
   * @returns { txId, dstAddress }
   */
  print = async (
    amount: BN,
    secureTokenAddress: string,
    printerAddress: string,
  ) => {
    if (amount.isZero() || amount.isNeg())
      throw new Error('The amount should be greater than zero')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    const certAddress = await this.deriveCertAddress(
      printerAddress,
      secureTokenAddress,
      true,
    )
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerAddress,
    )
    const treasurerAddress = await this.deriveTreasurerAddress(
      stableTokenPublicKey.toBase58(),
    )
    const treasury = await utils.token.associatedAddress({
      owner: new web3.PublicKey(treasurerAddress),
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const srcAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const dstAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: stableTokenPublicKey,
    })
    const txId = await this.program.rpc.print(amount, {
      accounts: {
        secureToken: new web3.PublicKey(secureTokenAddress),
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        treasurer: new web3.PublicKey(treasurerAddress),
        treasury,
        srcAssociatedTokenAccount,
        dstAssociatedTokenAccount,
        cert: new web3.PublicKey(certAddress),
        printer: new web3.PublicKey(printerAddress),
      },
    })
    return { txId, dstAddress: dstAssociatedTokenAccount.toBase58() }
  }

  /**
   * Burn stable tokens to get back a number of secure tokens.
   * The returned amount is computed by the predefined numerator & denominator rate of the certification of the secure token.
   * @param amount Burning amount.
   * @param secureTokenAddress Secure token address.
   * @param printerAddress Printer Address.
   * @returns { txId, dstAddress }
   */
  burn = async (
    amount: BN,
    secureTokenAddress: string,
    printerAddress: string,
  ) => {
    if (amount.isZero() || amount.isNeg())
      throw new Error('The amount should be greater than zero')
    if (!isAddress(secureTokenAddress))
      throw new Error('Invalid secure token address')
    if (!isAddress(printerAddress)) throw new Error('Invalid printer address')
    const certAddress = await this.deriveCertAddress(
      printerAddress,
      secureTokenAddress,
      true,
    )
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerAddress,
    )
    const treasurerAddress = await this.deriveTreasurerAddress(
      stableTokenPublicKey.toBase58(),
    )
    const treasury = await utils.token.associatedAddress({
      owner: new web3.PublicKey(treasurerAddress),
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const srcAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: stableTokenPublicKey,
    })
    const dstAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: this.program.provider.wallet.publicKey,
      mint: new web3.PublicKey(secureTokenAddress),
    })
    const txId = await this.program.rpc.burn(amount, {
      accounts: {
        secureToken: new web3.PublicKey(secureTokenAddress),
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        treasurer: new web3.PublicKey(treasurerAddress),
        treasury,
        srcAssociatedTokenAccount,
        dstAssociatedTokenAccount,
        cert: new web3.PublicKey(certAddress),
        printer: new web3.PublicKey(printerAddress),
      },
    })
    return { txId, dstAddress: dstAssociatedTokenAccount.toBase58() }
  }

  /**
   * Set new state for a certification
   * @param state The new state
   * @param certAddress Certificate address
   * @returns { txId }
   */
  setCertState = async (state: CertState, certAddress: string) => {
    if (!isAddress(certAddress)) throw new Error('Invalid cert address')
    const { printer: printerPublicKey, secureToken: secureTokenPublicKey } =
      await this.getCertData(certAddress)
    const { stableToken: stableTokenPublicKey } = await this.getPrinterData(
      printerPublicKey.toBase58(),
    )
    const txId = await this.program.rpc.setCertState(state, {
      accounts: {
        secureToken: secureTokenPublicKey,
        stableToken: stableTokenPublicKey,
        authority: this.program.provider.wallet.publicKey,
        printer: printerPublicKey,
        cert: new web3.PublicKey(certAddress),
      },
    })
    return { txId }
  }
}

export * from '../target/types/project_kylan'
export * from './constant'
export * from './utils'
export default Kylan

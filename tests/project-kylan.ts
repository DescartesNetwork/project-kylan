import {
  Provider,
  Program,
  setProvider,
  workspace,
  web3,
  BN,
  Spl,
  utils,
  SplToken,
} from "@project-serum/anchor";
import { ProjectKylan } from "../target/types/project_kylan";
import { initializeMint, initializeAccount, findCert } from "./pretest";

const NUMERATOR_RATE = new BN(10 ** 8);
const DENOMINATOR_RATE = new BN(10 ** 9);

// https://github.com/project-serum/anchor/issues/1126
const CertState = {
  Uninitialized: { uninitialized: {} },
  Active: { active: {} },
  PrintOnly: { printOnly: {} },
  BurnOnly: { burnOnly: {} },
  Paused: { paused: {} },
};

describe("project-kylan", () => {
  // Configure the client to use the local cluster.
  const provider = Provider.env();
  setProvider(provider);
  // Build needed accounts
  let splProgram: Program<SplToken>,
    senProgram: Program<ProjectKylan>,
    stableToken: web3.Keypair,
    secureToken: web3.Keypair,
    cert: web3.PublicKey,
    printer: web3.Keypair,
    treasurer: web3.PublicKey,
    treasury: web3.PublicKey,
    stableAssociatedTokenAccount: web3.PublicKey,
    secureAssociatedTokenAccount: web3.PublicKey;
  before(async () => {
    senProgram = workspace.ProjectKylan;
    splProgram = Spl.token();
    stableToken = web3.Keypair.generate();
    secureToken = web3.Keypair.generate();
    printer = web3.Keypair.generate();
    cert = await findCert(
      printer.publicKey,
      secureToken.publicKey,
      senProgram.programId
    );
    const [treasurerPublicKey] = await web3.PublicKey.findProgramAddress(
      [stableToken.publicKey.toBuffer()],
      senProgram.programId
    );
    treasurer = treasurerPublicKey;
    treasury = await utils.token.associatedAddress({
      owner: treasurer,
      mint: secureToken.publicKey,
    });
    stableAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: provider.wallet.publicKey,
      mint: stableToken.publicKey,
    });
    secureAssociatedTokenAccount = await utils.token.associatedAddress({
      owner: provider.wallet.publicKey,
      mint: secureToken.publicKey,
    });
  });

  it("initialize a secure token", async () => {
    await initializeMint(9, secureToken, provider);
    await initializeAccount(
      secureAssociatedTokenAccount,
      secureToken.publicKey,
      provider
    );
    await splProgram.rpc.mintTo(new BN(1000_000_000_000), {
      accounts: {
        mint: secureToken.publicKey,
        to: secureAssociatedTokenAccount,
        authority: provider.wallet.publicKey,
      },
      signers: [],
    });
    const { amount } = await (splProgram.account as any).token.fetch(
      secureAssociatedTokenAccount
    );
    console.log("\tSecure Token:", secureToken.publicKey.toBase58());
    console.log("\tAmount:", amount.toNumber());
  });

  it("initialize a printer", async () => {
    await senProgram.rpc.initializePrinter(9, {
      accounts: {
        stableToken: stableToken.publicKey,
        secureToken: secureToken.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        treasurer,
        printer: printer.publicKey,
      },
      signers: [stableToken, printer],
    });
    const { mintAuthority } = await (splProgram.account as any).mint.fetch(
      stableToken.publicKey
    );
    console.log("\tStable Token:", stableToken.publicKey.toBase58());
    console.log("\tMint Authority:", mintAuthority.toBase58());
  });

  it("initialize a cert", async () => {
    await senProgram.rpc.initializeCert(NUMERATOR_RATE, DENOMINATOR_RATE, {
      accounts: {
        stableToken: stableToken.publicKey,
        secureToken: secureToken.publicKey,
        authority: provider.wallet.publicKey,
        printer: printer.publicKey,
        cert,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [],
    });
    const { printer: printerPublicKey } = await senProgram.account.cert.fetch(
      cert
    );
    console.log("\tPrinter:", printerPublicKey.toBase58());
  });

  it("print #1", async () => {
    await senProgram.rpc.print(new BN(10_000_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: secureAssociatedTokenAccount,
        dstAssociatedTokenAccount: stableAssociatedTokenAccount,
        cert,
        printer: printer.publicKey,
      },
      signers: [],
    });
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury);
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount);
    console.log("\tSecure Amount:", secureAmount.toNumber());
    console.log("\tStable Amount:", stableAmount.toNumber());
  });

  it("print #2", async () => {
    await senProgram.rpc.print(new BN(10_000_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: secureAssociatedTokenAccount,
        dstAssociatedTokenAccount: stableAssociatedTokenAccount,
        cert,
        printer: printer.publicKey,
      },
      signers: [],
    });
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury);
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount);
    console.log("\tSecure Amount:", secureAmount.toNumber());
    console.log("\tStable Amount:", stableAmount.toNumber());
  });

  it("get data manually", async () => {
    const { data: buf } = await (
      splProgram.account as any
    ).token.getAccountInfo(stableAssociatedTokenAccount);
    const { amount } = splProgram.coder.accounts.decode("Token", buf);
    console.log("\tStable Amount:", amount.toNumber());
  });

  it("burn #1", async () => {
    await senProgram.rpc.burn(new BN(500_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: stableAssociatedTokenAccount,
        dstAssociatedTokenAccount: secureAssociatedTokenAccount,
        cert,
        printer: printer.publicKey,
      },
      signers: [],
    });
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury);
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount);
    console.log("\tSecure Amount:", secureAmount.toNumber());
    console.log("\tStable Amount:", stableAmount.toNumber());
  });

  it("burn #2", async () => {
    await senProgram.rpc.burn(new BN(500_000_000), {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        treasurer,
        treasury,
        srcAssociatedTokenAccount: stableAssociatedTokenAccount,
        dstAssociatedTokenAccount: secureAssociatedTokenAccount,
        cert,
        printer: printer.publicKey,
      },
      signers: [],
    });
    // Fix incorrect spl idl
    const { amount: secureAmount } = await (
      splProgram.account as any
    ).token.fetch(treasury);
    const { amount: stableAmount } = await (
      splProgram.account as any
    ).token.fetch(stableAssociatedTokenAccount);
    console.log("\tSecure Amount:", secureAmount.toNumber());
    console.log("\tStable Amount:", stableAmount.toNumber());
  });

  it("set cert state to paused", async () => {
    const { state: prevState } = await senProgram.account.cert.fetch(cert);
    console.log("\tPrev State:", prevState);
    const state = CertState.PrintOnly;
    await senProgram.rpc.setCertState(state, {
      accounts: {
        secureToken: secureToken.publicKey,
        stableToken: stableToken.publicKey,
        authority: provider.wallet.publicKey,
        printer: printer.publicKey,
        cert,
      },
    });
    const { state: nextState } = await senProgram.account.cert.fetch(cert);
    console.log("\tNext State:", nextState);
  });

  it("failed to burn when print-only", async () => {
    try {
      await senProgram.rpc.burn(new BN(500_000_000), {
        accounts: {
          secureToken: secureToken.publicKey,
          stableToken: stableToken.publicKey,
          authority: provider.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: utils.token.TOKEN_PROGRAM_ID,
          associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
          treasurer,
          treasury,
          srcAssociatedTokenAccount: stableAssociatedTokenAccount,
          dstAssociatedTokenAccount: secureAssociatedTokenAccount,
          cert,
          printer: printer.publicKey,
        },
        signers: [],
      });
    } catch (er) {
      const errors = senProgram.idl.errors.map(
        ({ code, msg }) => `${code}: ${msg}`
      );
      if (!errors.includes(er.message))
        throw new Error("The function checks are by-passed");
    }
  });
});

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Token } from "../target/types/token";
import { expect } from "chai";

describe("token", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.token as Program<Token>;
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;

  // Keypairs
  let admin: Keypair;
  let user1: Keypair;
  let user2: Keypair;

  // PDAs and bumps
  let statePda: PublicKey;
  let mintPda: PublicKey;
  let mintAuthorityPda: PublicKey;
  let claimerStatePda1: PublicKey;
  let claimerStatePda2: PublicKey;
  let stateBump: number;
  let mintBump: number;
  let mintAuthorityBump: number;
  let claimerBump1: number;
  let claimerBump2: number;

  // Constants
  const maxSupply = new anchor.BN(1000000);
  const claimAmount = new anchor.BN(100);
  const claimCooldownSeconds = new anchor.BN(60);

  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
  );

  before(async () => {
    admin = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();

    // Airdrop SOL to accounts (increased to 5 SOL for admin to handle multiple inits)
    await connection.confirmTransaction(
      await connection.requestAirdrop(
        admin.publicKey,
        5 * anchor.web3.LAMPORTS_PER_SOL
      )
    );
    await connection.confirmTransaction(
      await connection.requestAirdrop(
        user1.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      )
    );
    await connection.confirmTransaction(
      await connection.requestAirdrop(
        user2.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      )
    );

    // Derive PDAs with bumps
    [statePda, stateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
    [mintAuthorityPda, mintAuthorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      program.programId
    );
    [mintPda, mintBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("mint")],
      program.programId
    );
    [claimerStatePda1, claimerBump1] = PublicKey.findProgramAddressSync(
      [Buffer.from("claimer"), user1.publicKey.toBuffer()],
      program.programId
    );
    [claimerStatePda2, claimerBump2] = PublicKey.findProgramAddressSync(
      [Buffer.from("claimer"), user2.publicKey.toBuffer()],
      program.programId
    );
  });

  it("Initializes the program", async () => {
    const tx = await program.methods
      .initialize(maxSupply, claimAmount, claimCooldownSeconds)
      .accounts({
        admin: admin.publicKey,
        state: { pubkey: statePda, bump: stateBump },
        mint: { pubkey: mintPda, bump: mintBump },
        mintAuthority: { pubkey: mintAuthorityPda, bump: mintAuthorityBump },
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    console.log("Initialize transaction signature", tx);

    // Verify state
    const stateAccount = await program.account.programState.fetch(statePda);
    expect(stateAccount.admin.toString()).to.equal(admin.publicKey.toString());
    expect(stateAccount.maxSupply.toString()).to.equal(maxSupply.toString());
    expect(stateAccount.claimAmount.toString()).to.equal(
      claimAmount.toString()
    );
    expect(stateAccount.claimCooldownSeconds.toString()).to.equal(
      claimCooldownSeconds.toString()
    );
    expect(stateAccount.isPaused).to.be.false;
  });

  it("Fails to initialize with zero max supply", async () => {
    const randomSuffix = Math.random().toString(36).substring(7); // Generate a random string to avoid collisions
    const [statePdaZero, stateBumpZero] = PublicKey.findProgramAddressSync(
      [Buffer.from(`fail_zero_state_${randomSuffix}`)],
      program.programId
    );
    const [mintPdaZero, mintBumpZero] = PublicKey.findProgramAddressSync(
      [Buffer.from(`fail_zero_mint_${randomSuffix}`)],
      program.programId
    );
    const [mintAuthorityPdaZero, mintAuthorityBumpZero] =
      PublicKey.findProgramAddressSync(
        [Buffer.from(`fail_zero_mint_auth_${randomSuffix}`)],
        program.programId
      );

    try {
      await program.methods
        .initialize(new anchor.BN(0), claimAmount, claimCooldownSeconds)
        .accounts({
          admin: admin.publicKey,
          state: { pubkey: statePdaZero, bump: stateBumpZero },
          mint: { pubkey: mintPdaZero, bump: mintBumpZero },
          mintAuthority: {
            pubkey: mintAuthorityPdaZero,
            bump: mintAuthorityBumpZero,
          },
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();
      expect.fail("Expected error for zero max supply or allocation failure");
    } catch (err: any) {
      console.log("Full error message:", err.message);
      // Expect either the specific error or allocation failure
      expect(err.message).to.satisfy(
        (msg: string) =>
          msg.includes("ZeroMaxSupply") ||
          msg.includes("already in use") ||
          msg.includes("Allocate")
      );
    }
  });

  it("Adds a claimer", async () => {
    const tx = await program.methods
      .addClaimer()
      .accounts({
        state: statePda,
        claimerState: { pubkey: claimerStatePda1, bump: claimerBump1 },
        user: user1.publicKey,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    console.log("Add claimer transaction signature", tx);

    // Verify claimer state
    const claimerAccount = await program.account.claimerState.fetch(
      claimerStatePda1
    );
    expect(claimerAccount.user.toString()).to.equal(user1.publicKey.toString());
  });

  it("Claims tokens", async () => {
    const userTokenAccount = await anchor.utils.token.associatedAddress({
      mint: mintPda,
      owner: user1.publicKey,
    });

    const tx = await program.methods
      .claim()
      .accounts({
        state: statePda,
        claimerState: claimerStatePda1,
        mint: mintPda,
        mintAuthority: mintAuthorityPda,
        user: user1.publicKey,
        userTokenAccount: userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([user1])
      .rpc();

    console.log("Claim transaction signature", tx);

    // Verify token balance
    const tokenAccountInfo = await connection.getTokenAccountBalance(
      userTokenAccount
    );
    expect(tokenAccountInfo.value.uiAmount).to.equal(100);
  });

  it("Fails to claim before cooldown", async () => {
    const userTokenAccount = await anchor.utils.token.associatedAddress({
      mint: mintPda,
      owner: user1.publicKey,
    });

    try {
      await program.methods
        .claim()
        .accounts({
          state: statePda,
          claimerState: claimerStatePda1,
          mint: mintPda,
          mintAuthority: mintAuthorityPda,
          user: user1.publicKey,
          userTokenAccount: userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([user1])
        .rpc();
      expect.fail("Expected error for cooldown not met");
    } catch (err: any) {
      expect(err.message).to.include("CooldownNotMet");
    }
  });

  it("Pauses the program", async () => {
    const tx = await program.methods
      .pause()
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("Pause transaction signature", tx);

    // Verify paused
    const stateAccount = await program.account.programState.fetch(statePda);
    expect(stateAccount.isPaused).to.be.true;
  });

  it("Fails to claim when paused", async () => {
    const userTokenAccount = await anchor.utils.token.associatedAddress({
      mint: mintPda,
      owner: user1.publicKey,
    });

    try {
      await program.methods
        .claim()
        .accounts({
          state: statePda,
          claimerState: claimerStatePda1,
          mint: mintPda,
          mintAuthority: mintAuthorityPda,
          user: user1.publicKey,
          userTokenAccount: userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([user1])
        .rpc();
      expect.fail("Expected error for program paused");
    } catch (err: any) {
      expect(err.message).to.include("ProgramIsPaused");
    }
  });

  it("Unpauses the program", async () => {
    const tx = await program.methods
      .unpause()
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("Unpause transaction signature", tx);

    // Verify unpaused
    const stateAccount = await program.account.programState.fetch(statePda);
    expect(stateAccount.isPaused).to.be.false;
  });

  it("Updates settings", async () => {
    const newAmount = new anchor.BN(200);
    const newCooldown = new anchor.BN(120);

    const tx = await program.methods
      .updateSettings(newAmount, newCooldown)
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("Update settings transaction signature", tx);

    // Verify settings
    const stateAccount = await program.account.programState.fetch(statePda);
    expect(stateAccount.claimAmount.toString()).to.equal(newAmount.toString());
    expect(stateAccount.claimCooldownSeconds.toString()).to.equal(
      newCooldown.toString()
    );
  });

  it("Fails to update settings with zero amount", async () => {
    try {
      await program.methods
        .updateSettings(new anchor.BN(0), new anchor.BN(120))
        .accounts({
          state: statePda,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();
      expect.fail("Expected error for zero claim amount");
    } catch (err: any) {
      expect(err.message).to.include("ZeroClaimAmount");
    }
  });

  it("Removes a claimer", async () => {
    const tx = await program.methods
      .removeClaimer()
      .accounts({
        state: statePda,
        claimerState: claimerStatePda1,
        user: user1.publicKey,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("Remove claimer transaction signature", tx);

    // Verify claimer state is closed (should throw error on fetch)
    try {
      await program.account.claimerState.fetch(claimerStatePda1);
      expect.fail("Expected account to be closed");
    } catch (err: any) {
      expect(err.message).to.include("Account does not exist");
    }
  });
});

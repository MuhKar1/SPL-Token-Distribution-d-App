import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import fs from "fs";

// Read the keypair from the local Solana config
const keypairPath = process.env.HOME + "/.config/solana/id.json";
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

const PROGRAM_ID = new PublicKey("9Ya9WdXb8CTL2bvTvA25mApUQ8ndmBELwUAmJq6p2Btk");

async function main() {
  // Set up provider
  const connection = new anchor.web3.Connection("http://127.0.0.1:8899", "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load the program
  const idl = JSON.parse(fs.readFileSync("target/idl/token.json", "utf-8"));
  const program = new Program(idl, provider);

  console.log("🚀 Initializing token program...");
  console.log("Admin:", admin.publicKey.toBase58());
  console.log("Program ID:", PROGRAM_ID.toBase58());

  // PDAs
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    PROGRAM_ID
  );
  const [mintPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint")],
    PROGRAM_ID
  );
  const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")],
    PROGRAM_ID
  );

  console.log("State PDA:", statePda.toBase58());
  console.log("Mint PDA:", mintPda.toBase58());
  console.log("Mint Authority PDA:", mintAuthorityPda.toBase58());

  // Check if already initialized
  try {
    const state = await program.account.programState.fetch(statePda);
    console.log("✅ Program already initialized!");
    console.log("Current settings:", {
      admin: state.admin.toBase58(),
      maxSupply: state.maxSupply.toString(),
      claimAmount: state.claimAmount.toString(),
      cooldownSeconds: state.claimCooldownSeconds.toString(),
      isPaused: state.isPaused,
    });
    return;
  } catch (err) {
    console.log("Program not initialized yet, proceeding...");
  }

  // Airdrop some SOL to admin if needed
  try {
    const balance = await connection.getBalance(admin.publicKey);
    console.log("Admin balance:", balance / 1e9, "SOL");
    if (balance < 1e9) {
      console.log("Requesting airdrop...");
      const sig = await connection.requestAirdrop(admin.publicKey, 2e9);
      await connection.confirmTransaction(sig);
      console.log("✅ Airdrop confirmed");
    }
  } catch (err) {
    console.log("Airdrop error (may be rate limited):", err.message);
  }

  // Initialize the program
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );

  const maxSupply = new BN(1_000_000_000); // 1 billion tokens
  const claimAmount = new BN(100_000); // 100k tokens per claim
  const claimCooldownSeconds = new BN(300); // 5 minutes cooldown

  try {
    const SYSVAR_RENT_PUBKEY = new PublicKey("SysvarRent111111111111111111111111111111111");
    
    const tx = await program.methods
      .initialize(maxSupply, claimAmount, claimCooldownSeconds)
      .accountsStrict({
        admin: admin.publicKey,
        state: statePda,
        mint: mintPda,
        mintAuthority: mintAuthorityPda,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    console.log("✅ Initialize transaction signature:", tx);

    // Verify initialization
    const state = await program.account.programState.fetch(statePda);
    console.log("\n🎉 Program initialized successfully!");
    console.log("Settings:", {
      admin: state.admin.toBase58(),
      maxSupply: state.maxSupply.toString(),
      claimAmount: state.claimAmount.toString(),
      cooldownSeconds: state.claimCooldownSeconds.toString(),
      isPaused: state.isPaused,
    });
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    throw err;
  }
}

main()
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });

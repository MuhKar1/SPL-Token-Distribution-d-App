import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import fs from "fs";

// Read the admin keypair
const keypairPath = process.env.HOME + "/.config/solana/id.json";
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

const PROGRAM_ID = new PublicKey("9Ya9WdXb8CTL2bvTvA25mApUQ8ndmBELwUAmJq6p2Btk");

async function main() {
  // Get the claimer address from command line
  const claimerAddress = process.argv[2];
  if (!claimerAddress) {
    console.error("Usage: yarn ts-node scripts/add-claimer.ts <CLAIMER_PUBLIC_KEY>");
    process.exit(1);
  }

  const claimerPubkey = new PublicKey(claimerAddress);

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

  console.log("🚀 Adding claimer to token program...");
  console.log("Admin:", admin.publicKey.toBase58());
  console.log("Claimer:", claimerPubkey.toBase58());

  // PDAs
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    PROGRAM_ID
  );
  const [claimerStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("claimer"), claimerPubkey.toBuffer()],
    PROGRAM_ID
  );

  console.log("State PDA:", statePda.toBase58());
  console.log("Claimer State PDA:", claimerStatePda.toBase58());

  // Check if claimer already exists
  try {
    const claimerState = await (program.account as any).claimerState.fetch(claimerStatePda);
    console.log("⚠️ Claimer already exists!");
    console.log("Claimer info:", {
      claimer: claimerState.claimer.toBase58(),
      lastClaim: new Date(claimerState.lastClaimTimestamp * 1000).toISOString(),
    });
    return;
  } catch (err) {
    console.log("Claimer not found, proceeding to add...");
  }

  // Add the claimer
  try {
    const tx = await program.methods
      .addClaimer()
      .accountsStrict({
        admin: admin.publicKey,
        state: statePda,
        claimerState: claimerStatePda,
        user: claimerPubkey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    console.log("✅ Add claimer transaction signature:", tx);

    // Verify
    const claimerState = await (program.account as any).claimerState.fetch(claimerStatePda);
    console.log("\n🎉 Claimer added successfully!");
    console.log("Claimer info:", {
      user: claimerState.user?.toBase58() || 'N/A',
      lastClaimTimestamp: claimerState.lastClaimTimestamp?.toString() || 'N/A',
    });
  } catch (err) {
    console.error("❌ Failed to add claimer:", err);
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

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import fs from "fs";

// Read the admin keypair
const keypairPath = process.env.HOME + "/.config/solana/id.json";
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
const currentAdmin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

const PROGRAM_ID = new PublicKey("9Ya9WdXb8CTL2bvTvA25mApUQ8ndmBELwUAmJq6p2Btk");

async function updateAdmin(newAdminAddress: string) {
  const newAdminPubkey = new PublicKey(newAdminAddress);

  // Set up provider
  const connection = new anchor.web3.Connection("http://127.0.0.1:8899", "confirmed");
  const wallet = new anchor.Wallet(currentAdmin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load the program
  const idl = JSON.parse(fs.readFileSync("target/idl/token.json", "utf-8"));
  const program = new Program(idl, provider);

  console.log("🔄 Updating admin for token program...");
  console.log("Current Admin:", currentAdmin.publicKey.toBase58());
  console.log("New Admin:", newAdminPubkey.toBase58());

  // PDAs
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    PROGRAM_ID
  );

  console.log("State PDA:", statePda.toBase58());

  // Update the admin
  try {
    const tx = await program.methods
      .updateAdmin(newAdminPubkey)
      .accountsStrict({
        admin: currentAdmin.publicKey,
        state: statePda,
      })
      .signers([currentAdmin])
      .rpc();

    console.log("✅ Update admin transaction signature:", tx);

    // Verify
    const state = await (program.account as any).programState.fetch(statePda);
    console.log("\n🎉 Admin updated successfully!");
    console.log("New admin:", state.admin.toBase58());
  } catch (err) {
    console.error("❌ Failed to update admin:", err);
    throw err;
  }
}

// Get new admin address from command line
const newAdminAddress = process.argv[2];
if (!newAdminAddress) {
  console.error("Usage: yarn ts-node scripts/update-admin.ts <NEW_ADMIN_PUBLIC_KEY>");
  console.error("Example: yarn ts-node scripts/update-admin.ts G9dig4oMw2xALXjqfNA1stSEc2vJm5Wph7d45Yg7sV5y");
  process.exit(1);
}

updateAdmin(newAdminAddress)
  .then(() => {
    console.log("\n✅ Done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });

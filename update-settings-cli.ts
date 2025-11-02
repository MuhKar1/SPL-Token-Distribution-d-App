import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import fs from "fs";

// Use the CLI wallet as admin
const keypairPath = process.env.HOME + "/.config/solana/id.json";
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
const admin = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(keypairData));

const PROGRAM_ID = new PublicKey("9Ya9WdXb8CTL2bvTvA25mApUQ8ndmBELwUAmJq6p2Btk");

async function updateSettings(newClaimAmount: number, newCooldownSeconds: number) {
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

  console.log("🔄 Updating token program settings...");
  console.log("Admin:", admin.publicKey.toBase58());
  console.log("New claim amount:", newClaimAmount, "tokens");
  console.log("New cooldown:", newCooldownSeconds, "seconds");

  // PDAs
  const [statePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state")],
    PROGRAM_ID
  );

  console.log("State PDA:", statePda.toBase58());

  try {
    const tx = await program.methods
      .updateSettings(
        new BN(newClaimAmount),
        new BN(newCooldownSeconds)
      )
      .accounts({
        state: statePda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("✅ Settings updated successfully!");
    console.log("Transaction:", tx);
  } catch (error) {
    console.error("❌ Failed to update settings:", error);
  }
}

// Get arguments from command line
const newAmount = parseInt(process.argv[2]);
const newCooldown = parseInt(process.argv[3]);

if (!newAmount || !newCooldown) {
  console.log("Usage: yarn ts-node update-settings-cli.ts <claim_amount> <cooldown_seconds>");
  console.log("Example: yarn ts-node update-settings-cli.ts 200000 600");
  process.exit(1);
}

updateSettings(newAmount, newCooldown);

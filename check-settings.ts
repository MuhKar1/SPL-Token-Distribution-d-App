import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import fs from "fs";

const PROGRAM_ID = new PublicKey("9Ya9WdXb8CTL2bvTvA25mApUQ8ndmBELwUAmJq6p2Btk");
const connection = new anchor.web3.Connection("http://127.0.0.1:8899", "confirmed");

const idl = JSON.parse(fs.readFileSync("target/idl/token.json", "utf-8"));
const provider = new anchor.AnchorProvider(connection, {} as any, { commitment: "confirmed" });
const program = new anchor.Program(idl, PROGRAM_ID, provider);

async function checkSettings() {
  const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("state")], PROGRAM_ID);
  const stateAccount = await (program.account as any).programState.fetch(statePda);

  console.log("Current Program Settings:");
  console.log("Admin:", stateAccount.admin.toBase58());
  console.log("Mint:", stateAccount.mint.toBase58());
  console.log("Max Supply:", stateAccount.maxSupply.toNumber());
  console.log("Total Minted:", stateAccount.totalMinted.toNumber());
  console.log("Claim Amount:", stateAccount.claimAmount.toNumber());
  console.log("Claim Cooldown:", stateAccount.claimCooldownSeconds.toNumber(), "seconds");
  console.log("Is Paused:", stateAccount.isPaused);
}

checkSettings().catch(console.error);

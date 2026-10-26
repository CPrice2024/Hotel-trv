import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { connectDatabase, disconnectDatabase } from "./connection.js";
import { Room } from "./models.js";

const roomSeedSchema = z.array(
  z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(5).max(1000),
    imageUrl: z.union([z.string().url().max(1000), z.literal("")]).default(""),
    inventory: z.number().int().min(1).max(500),
    maxGuests: z.number().int().min(1).max(12),
    priceETB: z.number().int().min(0).max(100_000_000),
    priceUSD: z.number().min(0.5).max(1_000_000).multipleOf(0.01),
    testOnly: z.boolean().default(false),
  }),
);

const dataFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/rooms.json");

async function seedRooms(): Promise<void> {
  await connectDatabase();
  const raw = await readFile(dataFile, "utf8");
  const parsed = roomSeedSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Room seed data is invalid: ${parsed.error.message}`);
  }
  if (
    process.env.NODE_ENV === "production" &&
    parsed.data.some((entry) => entry.testOnly)
  ) {
    throw new Error("Test-only room entries cannot be seeded in production.");
  }
  if (parsed.data.length === 0) {
    console.info("No room entries to seed. Add real hotel room names, inventory, and rates to backend/data/rooms.json.");
    return;
  }

  for (const entry of parsed.data) {
    await Room.updateOne(
      { name: entry.name },
      {
        $set: {
          ...entry,
          priceUSDCents: Math.round(entry.priceUSD * 100),
          active: true,
        },
      },
      { upsert: true, runValidators: true },
    );
  }
  console.info(`Seeded ${parsed.data.length} room type(s).`);
}

void seedRooms()
  .catch((error: unknown) => {
    console.error("Room seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });

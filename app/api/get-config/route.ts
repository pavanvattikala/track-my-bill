import { NextResponse } from "next/server";
import { google } from "googleapis";

const ROOT_FOLDER_NAME = "Track-My-Bills";
const CONFIG_FILE_NAME = "config.json";

export const DEFAULT_CATEGORIES = [
  "Food & Dining",
  "Groceries",
  "Travel",
  "Utilities",
  "Medical",
  "Shopping",
  "Entertainment",
  "Services",
  "Miscellaneous",
];

const DEFAULT_CONFIG = {
  categories: DEFAULT_CATEGORIES,
  version: 1,
};

/**
 * Finds or creates a top-level folder in the user's Drive root.
 */
async function findOrCreateRootFolder(drive: any, folderName: string): Promise<string> {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and 'root' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create root folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  return folder.data.id!;
}

/**
 * Finds the config.json file inside the root folder. Returns null if not found.
 */
async function findConfigFile(drive: any, parentId: string): Promise<string | null> {
  const res = await drive.files.list({
    q: `name='${CONFIG_FILE_NAME}' and '${parentId}' in parents and mimeType='application/json' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }
  return null;
}

/** GET /api/get-config — loads or creates config.json from the user's Drive */
export async function GET(req: Request) {
  try {
    const accessToken = req.headers.get("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    // 1. Find or create the root "Track-My-Bills" folder
    const rootFolderId = await findOrCreateRootFolder(drive, ROOT_FOLDER_NAME);

    // 2. Look for config.json inside it
    const configFileId = await findConfigFile(drive, rootFolderId);

    if (configFileId) {
      // 3a. File exists — download and parse it
      const fileRes = await drive.files.get(
        { fileId: configFileId, alt: "media" },
        { responseType: "text" }
      );
      try {
        const config = JSON.parse(fileRes.data as string);
        return NextResponse.json(config, { status: 200 });
      } catch {
        // Corrupted JSON — return defaults
        console.warn("config.json is malformed. Returning defaults.");
        return NextResponse.json(DEFAULT_CONFIG, { status: 200 });
      }
    } else {
      // 3b. No config file — create it with defaults
      const configJson = JSON.stringify(DEFAULT_CONFIG, null, 2);

      await drive.files.create({
        requestBody: {
          name: CONFIG_FILE_NAME,
          mimeType: "application/json",
          parents: [rootFolderId],
        },
        media: {
          mimeType: "application/json",
          body: configJson,
        },
        fields: "id",
      });

      console.log("Created default config.json in Drive.");
      return NextResponse.json(DEFAULT_CONFIG, { status: 200 });
    }
  } catch (error) {
    console.error("Get Config Error:", error);
    return NextResponse.json(
      { error: "Failed to load config.", details: (error as Error).message },
      { status: 500 }
    );
  }
}

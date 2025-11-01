import { NextResponse } from "next/server";
import { google } from "googleapis";
import moment from "moment";

// --- CONFIGURATION ---
const TARGET_FOLDER_NAME = "track-my-bills";
const SPREADSHEET_HEADER = [
  "Date",
  "Vendor",
  "Category",
  "Amount",
  "Notes",
  "Receipt Link",
  "Upload ID",
];
const MONTHLY_TABS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const SUMMARY_TAB_NAME = "Annual-Summary";

const AMOUNT_COLUMN_LETTER = "D";
const MONTHLY_TOTAL_CELL = "F2";
const MONTHLY_TOTAL_LABEL_CELL = "F1";
const MONTHLY_TOTAL_FORMULA = `=SUM(${AMOUNT_COLUMN_LETTER}:${AMOUNT_COLUMN_LETTER})`;

// --- TYPES ---
interface ExtractedData {
  amount: number | null;
  vendor: string | null;
  date: string | null;
  category: string | null;
  notes: string | null;
}

interface UploadResult {
  id: string;
  fileName: string;
  link: string;
}

interface RequestBody {
  data: ExtractedData;
  upload: UploadResult;
}

/**
 * Finds the ID of the "track-my-bills" folder, or creates it if it doesn't exist.
 */
async function findFolderId(drive: any, folderName: string): Promise<string> {
  const res = await drive.files.list({
    // Searches for a folder, named {folderName}, in the root of "My Drive"
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and 'root' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id; // Found it
  }

  // If not found, create it in the root
  console.log(`Folder '${folderName}' not found. Creating it...`);
  const fileMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  const folder = await drive.files.create({
    resource: fileMetadata,
    fields: "id",
  });
  return folder.data.id;
}

/**
 * Creates a new yearly spreadsheet with all monthly tabs and the summary tab.
 */
async function createYearlySpreadsheet(
  drive: any,
  sheets: any,
  folderId: string,
  fileName: string
): Promise<string> {
  // 1. Create the new spreadsheet file in the target folder
  const fileMetadata = {
    name: fileName,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [folderId],
  };
  const spreadsheet = await drive.files.create({
    resource: fileMetadata,
    fields: "id",
  });

  const spreadsheetId = spreadsheet.data.id;

  const metadataResponse = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId,
    fields: "sheets.properties.sheetId",
  });
  const defaultSheetId = metadataResponse.data.sheets[0].properties.sheetId;

  if (!spreadsheetId) {
    throw new Error(`Failed to create spreadsheet: ${fileName}`);
  }

  // 2. all 13 new tabs to be created
  const ALL_TABS_IN_ORDER = [SUMMARY_TAB_NAME, ...MONTHLY_TABS];

  const tabCreationRequests = ALL_TABS_IN_ORDER.map((title) => ({
    addSheet: {
      properties: { title: title },
    },
  }));

  // 3. request to delete the original "Sheet1"
  const deleteDefaultSheetRequest = {
    deleteSheet: { sheetId: defaultSheetId },
  };

  // 4. Run batch update to create all 13 tabs and delete "Sheet1"
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId,
    requestBody: {
      requests: [...tabCreationRequests, deleteDefaultSheetRequest],
    },
  });

  const dataForBatchUpdate: any[] = [];

  // 5a. Add headers and formulas for each monthly tab

  MONTHLY_TABS.forEach((tabName) => {
    // Add header
    dataForBatchUpdate.push({
      range: `${tabName}!A1`,
      values: [SPREADSHEET_HEADER],
    });
    // Add Total label and formula
    dataForBatchUpdate.push({
      range: `${tabName}!${MONTHLY_TOTAL_LABEL_CELL}`,
      values: [["Monthly Total"], [MONTHLY_TOTAL_FORMULA]],
    });
  });

  // 5b. Add formulas for the "Annual-Summary" tab
  const summaryTabFormulas = [
    ["Quarter 1", ""],
    ["January", `='JAN'!${MONTHLY_TOTAL_CELL}`],
    ["February", `='FEB'!${MONTHLY_TOTAL_CELL}`],
    ["March", `='MAR'!${MONTHLY_TOTAL_CELL}`],
    ["Q1 Total", `=SUM(B2:B4)`],
    ["", ""], // Spacer
    ["Quarter 2", ""],
    ["April", `='APR'!${MONTHLY_TOTAL_CELL}`],
    ["May", `='MAY'!${MONTHLY_TOTAL_CELL}`],
    ["June", `='JUN'!${MONTHLY_TOTAL_CELL}`],
    ["Q2 Total", `=SUM(B8:B10)`],
    ["", ""],
    ["Quarter 3", ""],
    ["July", `='JUL'!${MONTHLY_TOTAL_CELL}`],
    ["August", `='AUG'!${MONTHLY_TOTAL_CELL}`],
    ["September", `='SEP'!${MONTHLY_TOTAL_CELL}`],
    ["Q3 Total", `=SUM(B14:B16)`],
    ["", ""],
    ["Quarter 4", ""],
    ["October", `='OCT'!${MONTHLY_TOTAL_CELL}`],
    ["November", `='NOV'!${MONTHLY_TOTAL_CELL}`],
    ["December", `='DEC'!${MONTHLY_TOTAL_CELL}`],
    ["Q4 Total", `=SUM(B20:B22)`],
    ["", ""],
    ["", ""],
    ["YEARLY GRAND TOTAL", `=B5+B11+B17+B23`],
  ];

  dataForBatchUpdate.push({
    range: `${SUMMARY_TAB_NAME}!A1`,
    values: summaryTabFormulas,
  });

  // 6. Execute the batch write to add all headers and formulas
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: dataForBatchUpdate,
    },
  });

  return spreadsheetId;
}

/**
 * Finds the yearly spreadsheet by name, or calls the create function if it's not found.
 */
async function findOrCreateYearlySpreadsheet(
  drive: any,
  sheets: any,
  folderId: string,
  fileName: string
): Promise<string> {
  // 1. Search for the file in the target folder
  const q = `name = '${fileName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and '${folderId}' in parents`;

  const res = await drive.files.list({
    q: q,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files.length > 0) {
    console.log("➡️ Using the first file found:", res.data.files[0]);
    return res.data.files[0].id;
  }

  // 3. File not found, run the full "First-Time Setup"
  console.log(`No existing spreadsheet found for: ${fileName}.`);
  console.log(`Spreadsheet ${fileName} not found. Running First-Time Setup...`);
  return await createYearlySpreadsheet(drive, sheets, folderId, fileName);
}

/** Entry point for the log-bill API route */
export async function POST(req: Request) {
  try {
    // 1. Authentication & Validation
    const accessToken = req.headers.get("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 }
      );
    }

    // 2. Parse JSON Body
    const { data, upload }: RequestBody = await req.json();
    if (!data || !upload || !data.date) {
      return NextResponse.json(
        {
          error: "Missing required data fields (data, upload result, or date).",
        },
        { status: 400 }
      );
    }

    // 3. Initialize & Parse
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    const dateObject = moment(data.date);
    if (!dateObject.isValid()) {
      return NextResponse.json(
        { error: `Invalid date format: ${data.date}` },
        { status: 400 }
      );
    }

    const fileName = `Bills-${dateObject.format("YYYY")}`; // e.g., "Bills-2025"
    const tabName = dateObject.format("MMM").toUpperCase(); // e.g., "NOV"

    // 4. Find or Create Folder
    const folderId = await findFolderId(drive, TARGET_FOLDER_NAME);

    // 5. Find or Create Yearly Spreadsheet
    const finalSpreadsheetId = await findOrCreateYearlySpreadsheet(
      drive,
      sheets,
      folderId,
      fileName
    );

    // 6. Prepare and Append Expense Data
    const newRow: (string | number | null)[] = [
      data.date,
      data.vendor,
      data.category,
      data.amount,
      data.notes,
      upload.link,
      upload.id,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: finalSpreadsheetId,
      range: `${tabName}!A1`, // Appending to "A1" of the tab finds the next empty row
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [newRow],
      },
    });

    // 7. Return Success Response
    const spreadsheetLink = `https://docs.google.com/spreadsheets/d/${finalSpreadsheetId}`;

    return NextResponse.json(
      {
        message: `Data successfully inserted into tab '${tabName}' in file '${fileName}'.`,
        spreadsheetLink: spreadsheetLink,
        spreadsheetId: finalSpreadsheetId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Sheets/Drive API Error:", error);
    return NextResponse.json(
      {
        error: "Failed to process request.",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { google } from "googleapis";
import moment from "moment";

// --- CONFIGURATION ---
const ROOT_FOLDER_NAME = "Track-My-Bills";
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
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
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

// --- DRIVE HELPERS ---

/**
 * Finds a folder by name within a parent folder, or creates it if it doesn't exist.
 */
async function findOrCreateFolder(
  drive: any,
  folderName: string,
  parentId?: string
): Promise<string> {
  const parentQuery = parentId ? `'${parentId}' in parents and ` : "";
  const q = `${parentQuery}mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;

  const searchRes = await drive.files.list({
    q,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id;
  }

  // Create it
  const requestBody: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) requestBody.parents = [parentId];

  const createRes = await drive.files.create({
    requestBody,
    fields: "id",
  });
  return createRes.data.id!;
}

/**
 * Traverses and creates a nested folder structure (e.g. 'Track-My-Bills/2024/Apr').
 */
async function findOrCreateNestedFolder(drive: any, path: string): Promise<string> {
  const parts = path.split("/");
  let currentParentId: string | undefined = undefined;

  for (const folderName of parts) {
    currentParentId = await findOrCreateFolder(drive, folderName, currentParentId);
  }

  return currentParentId!;
}

/**
 * Sanitizes a string to be safe for use as a file/folder name.
 */
function sanitize(str: string): string {
  return str.replace(/[\\/:*?"<>|]/g, "").trim();
}

// --- SPREADSHEET HELPERS ---

/**
 * Creates a new yearly spreadsheet with all monthly tabs and the summary tab.
 */
async function createYearlySpreadsheet(
  drive: any,
  sheets: any,
  folderId: string,
  fileName: string
): Promise<string> {
  const fileMetadata = {
    name: fileName,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [folderId],
  };
  const spreadsheet = await drive.files.create({
    requestBody: fileMetadata,
    fields: "id",
  });

  const spreadsheetId = spreadsheet.data.id;

  const metadataResponse = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.sheetId",
  });
  const defaultSheetId = metadataResponse.data.sheets[0].properties.sheetId;

  if (!spreadsheetId) {
    throw new Error(`Failed to create spreadsheet: ${fileName}`);
  }

  const ALL_TABS_IN_ORDER = [SUMMARY_TAB_NAME, ...MONTHLY_TABS];
  const tabCreationRequests = ALL_TABS_IN_ORDER.map((title) => ({
    addSheet: { properties: { title } },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [...tabCreationRequests, { deleteSheet: { sheetId: defaultSheetId } }],
    },
  });

  const dataForBatchUpdate: any[] = [];

  MONTHLY_TABS.forEach((tabName) => {
    dataForBatchUpdate.push({ range: `${tabName}!A1`, values: [SPREADSHEET_HEADER] });
    dataForBatchUpdate.push({
      range: `${tabName}!${MONTHLY_TOTAL_LABEL_CELL}`,
      values: [["Monthly Total"], [MONTHLY_TOTAL_FORMULA]],
    });
  });

  const summaryTabFormulas = [
    ["Quarter 1", ""],
    ["January", `='JAN'!${MONTHLY_TOTAL_CELL}`],
    ["February", `='FEB'!${MONTHLY_TOTAL_CELL}`],
    ["March", `='MAR'!${MONTHLY_TOTAL_CELL}`],
    ["Q1 Total", `=SUM(B2:B4)`],
    ["", ""],
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

  dataForBatchUpdate.push({ range: `${SUMMARY_TAB_NAME}!A1`, values: summaryTabFormulas });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: dataForBatchUpdate,
    },
  });

  return spreadsheetId;
}

/**
 * Finds the yearly spreadsheet by name, or creates it if not found.
 */
async function findOrCreateYearlySpreadsheet(
  drive: any,
  sheets: any,
  folderId: string,
  fileName: string
): Promise<string> {
  const q = `name = '${fileName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and '${folderId}' in parents`;

  const res = await drive.files.list({ q, fields: "files(id, name)", spaces: "drive" });

  if (res.data.files.length > 0) {
    console.log("Using existing spreadsheet:", res.data.files[0].id);
    return res.data.files[0].id;
  }

  console.log(`Spreadsheet ${fileName} not found. Creating...`);
  return await createYearlySpreadsheet(drive, sheets, folderId, fileName);
}

// --- ENTRY POINT ---

/** Entry point for the log-bill API route */
export async function POST(req: Request) {
  try {
    // 1. Authentication & Validation
    const accessToken = req.headers.get("Authorization")?.split(" ")[1];
    if (!accessToken) {
      return NextResponse.json({ error: "Missing authentication token." }, { status: 401 });
    }

    // 2. Parse JSON Body
    const { data, upload }: RequestBody = await req.json();
    if (!data || !upload || !data.date) {
      return NextResponse.json(
        { error: "Missing required data fields (data, upload result, or date)." },
        { status: 400 }
      );
    }

    // 3. Initialize Google APIs
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: "v4", auth });
    const drive = google.drive({ version: "v3", auth });

    const dateObject = moment(data.date);
    if (!dateObject.isValid()) {
      return NextResponse.json({ error: `Invalid date format: ${data.date}` }, { status: 400 });
    }

    const yearStr = dateObject.format("YYYY");   // e.g. "2024"
    const monthStr = dateObject.format("MMM");   // e.g. "Apr"
    const tabName = monthStr.toUpperCase();       // e.g. "APR"
    const spreadsheetFileName = `Bills-${yearStr}`; // e.g. "Bills-2024"

    // 4. Find/create nested folder: Track-My-Bills/YYYY/MMM for bills files
    // and Track-My-Bills root for the spreadsheet
    const rootFolderId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
    const billFolderPath = `${ROOT_FOLDER_NAME}/${yearStr}/${monthStr}`;
    const billFolderId = await findOrCreateNestedFolder(drive, billFolderPath);

    // 5. Find or Create Yearly Spreadsheet (kept in root Track-My-Bills folder)
    const finalSpreadsheetId = await findOrCreateYearlySpreadsheet(
      drive, sheets, rootFolderId, spreadsheetFileName
    );

    // 6. Prepare and Append Expense Data to Sheet
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
      range: `${tabName}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [newRow] },
    });

    // 7. Rename and move the uploaded bill file to Track-My-Bills/YYYY/MMM/
    let updatedFileLink = upload.link;
    let updatedFileName = upload.fileName;

    if (upload.id && upload.id !== "dummy_id") {
      try {
        // Build clean file name: YYYY-MM-DD_Vendor.ext
        const ext = upload.fileName.includes(".")
          ? upload.fileName.split(".").pop()
          : "jpg";
        const vendorSlug = sanitize(data.vendor || "Unknown").replace(/\s+/g, "_");
        const newFileName = `${data.date}_${vendorSlug}.${ext}`;

        // Get current parents so we can remove them when moving
        const fileMetaRes = await drive.files.get({
          fileId: upload.id,
          fields: "parents",
        });
        const currentParents = fileMetaRes.data.parents?.join(",") || "";

        // Move file: add new parent, remove old ones
        const updatedFile = await drive.files.update({
          fileId: upload.id,
          addParents: billFolderId,
          removeParents: currentParents,
          requestBody: { name: newFileName },
          fields: "id, webViewLink, name",
        });

        updatedFileLink = updatedFile.data.webViewLink || upload.link;
        updatedFileName = updatedFile.data.name || upload.fileName;
        console.log(`File renamed to '${updatedFileName}' and moved to '${billFolderPath}'`);
      } catch (renameErr) {
        // Non-critical — log warning but don't fail the whole request
        console.warn("File rename/move failed (non-critical):", (renameErr as Error).message);
      }
    }

    // 8. Return Success Response
    const spreadsheetLink = `https://docs.google.com/spreadsheets/d/${finalSpreadsheetId}`;

    return NextResponse.json(
      {
        message: `Data logged to tab '${tabName}' in '${spreadsheetFileName}'.`,
        spreadsheetLink,
        spreadsheetId: finalSpreadsheetId,
        updatedFileLink,
        updatedFileName,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Sheets/Drive API Error:", error);
    return NextResponse.json(
      { error: "Failed to process request.", details: (error as Error).message },
      { status: 500 }
    );
  }
}

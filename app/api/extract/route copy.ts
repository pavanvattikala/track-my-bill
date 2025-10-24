import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// Define the JSON schema for Perplexity's structured output
// This constant remains the same.
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    totalAmount: {
      type: "number",
      description: "The final, grand total amount of the invoice or receipt.",
    },
    vendorName: {
      type: "string",
      description: "The name of the company or vendor issuing the invoice.",
    },
    invoiceDate: {
      type: "string",
      description: "The date the invoice was issued, in YYYY-MM-DD format.",
    },
  },
  required: ["totalAmount", "vendorName", "invoiceDate"],
};

export async function POST(request: NextRequest) {
  try {
    // --- Step 1: Parse Incoming File ---
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided." },
        { status: 400 }
      );
    }

    // --- Step 2: Encode File to Base64 ---
    const fileBuffer = await file.arrayBuffer();
    const base64File = Buffer.from(fileBuffer).toString("base64");
    const mimeType = file.type;

    // --- Step 3: Call Perplexity Sonar API ---
    // REFACTORED THIS BLOCK
    const perplexityResponse = await fetch(
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Note: The 'json_schema' feature works best with pro models
          model: "sonar",
          disable_search: true, 
          messages: [
            {
              role: "system",
              content:
                "You are an expert data extraction assistant. Analyze the provided document and extract the key information precisely according to the requested JSON schema. Do not make up information.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract the data from this document and return it as a JSON object matching the provided schema.",
                },
                {
                  type: "file_url",
                  file_url: {
                    url: base64File,
                  },
                },
              ],
            },
          ],
          // --- NEW METHOD ---
          // Use response_format instead of tools/tool_choice
          response_format: {
            type: "json_schema",
            json_schema: {
              schema: EXTRACTION_SCHEMA,
            },
          },
        }),
      }
    );

    if (!perplexityResponse.ok) {
      const errorData = await perplexityResponse.json();
      console.error("Perplexity API Error:", errorData);
      const status = perplexityResponse.status;
      let errorMsg = "Failed to call Perplexity API.";
      if (status === 429) {
        errorMsg = "Rate limit hit. Please try again later.";
      }
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status }
      );
    }

    // --- CRITICAL BUG FIX ---
    // Removed the hardcoded 'return NextResponse.json(...)'
    // that was here and blocking the rest of the code.

    const perplexityData = await perplexityResponse.json();

    console.log("Perplexity Response Data:", perplexityData);

    // --- REFACTORED RESPONSE PARSING ---
    // The JSON is now the direct content of the message
    const responseContent = perplexityData.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error("Invalid response structure from Perplexity (no content).");
    }

    // The content is a JSON *string*, so we still need to parse it
    const extractedArgs = JSON.parse(responseContent);
    const { totalAmount, vendorName, invoiceDate } = extractedArgs;

    console.log("Extracted Arguments:", extractedArgs);

    // if (totalAmount === undefined) {
    //   throw new Error("Failed to extract the required 'totalAmount' field.");
    // }

    // // --- Step 4: Log to Google Sheets (No changes needed) ---
    // const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(
    //   /\\n/g,
    //   "\n"
    // );

    // const auth = new google.auth.GoogleAuth({
    //   credentials: {
    //     client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    //     private_key: privateKey,
    //   },
    //   scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    // });

    // const sheets = google.sheets({ version: "v4", auth });

    // const newRow = [
    //   new Date().toISOString(), // Timestamp
    //   vendorName || "",
    //   invoiceDate || "",
    //   totalAmount || 0,
    //   file.name, // Original Filename
    // ];

    // await sheets.spreadsheets.values.append({
    //   spreadsheetId: process.env.GOOGLE_SHEET_ID,
    //   range: "Sheet1!A:E", // Adjust 'Sheet1' and range as needed
    //   valueInputOption: "USER_ENTERED",
    //   resource: {
    //     values: [newRow],
    //   },
    // });

    // --- Step 5: Return Success Response (No changes needed) ---
    return NextResponse.json({
      success: true,
      totalAmount: totalAmount,
      vendorName: vendorName,
      invoiceDate: invoiceDate,
    });
  } catch (error: any) {
    console.error("Error in /api/extract:", error);
    return NextResponse.json(
      { success: false, error: error.message || "An internal server error occurred." },
      { status: 500 }
    );
  }
}

// Kept your GET handler as-is, just matching NextRequest type
export async function GET(request: NextRequest) {
  console.log("GET request received at /api/extract");
  return NextResponse.json({
    message: "This endpoint is for POST requests to extract data.",
  });
}
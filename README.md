# 🧾 AI Enabled Bill Tracker: Track My Bill

**Track My Bill** is a **mobile-first web application** that completely automates your expense logging. Stop manually entering data\! Just upload a photo of any bill or receipt, and the app instantly extracts key financial data, securely archives the file in your Google Drive, and logs the details directly into your Google Sheet.

## ✨ Features & The Automated Workflow

Our application turns the tedious chore of expense reporting into a simple, four-step, automated process powered by AI and Google Workspace integration.

1.  **📸 Capture & Upload:** Use the mobile-optimized interface (built with **Tailwind CSS**) to snap a photo or upload an image/document (JPEG, PNG, PDF, etc.).
2.  **🔒 Secure Archiving:** The original file (**Image or PDF**) is instantly and securely uploaded to a designated folder in your **personal Google Drive**.
3.  **🧠 Intelligent Extraction:** The Perplexity AI `sonar` model processes the file, using a structured JSON schema to guarantee accurate, reliable data output.
4.  **📈 Automated Logging:** The extracted financial data is automatically inserted as a new, organized row into your **Google Sheet**, creating a real-time, audit-ready expense log.

---

### Structured Data Output

The AI is engineered to extract these five critical, standardized fields for effortless analysis:

| Field          | Description                          | Format/Example                      |
| :------------- | :----------------------------------- | :---------------------------------- |
| **`amount`**   | The total cost of the purchase.      | `145.50`                            |
| **`vendor`**   | The short name of the company/store. | `Starbucks`                         |
| **`date`**     | The date of the transaction.         | **YYYY-MM-DD** (`2025-11-02`)       |
| **`category`** | The primary spending category.       | `Food`, `Travel`, `Office Supplies` |
| **`notes`**    | A short, optional description.       | `Client lunch meeting`              |

---

## 🚀 Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites

You must have the following tools and credentials:

- **Node.js** (v18 or higher)
- **npm** or **Yarn**
- A **Perplexity API Key** (for data extraction).
- **Google OAuth Credentials** (for Drive and Sheets API access).

### 1\. Clone the Repository

```bash
git clone https://github.com/pavanvattikala/track-my-bill.git
cd track-my-bill
```

### 2\. Install Dependencies

```bash
npm install
```

### 3\. Configure Environment Variables

Create a file named `.env` in your root directory and add your API keys and Google authentication details.

```env
# Perplexity AI Key for data extraction (using sonar model)
PERPLEXITY_API_KEY="YOUR_PERPLEXITY_API_KEY"

# Google OAuth 2.0 Credentials for Drive/Sheets integration
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
# The ID of the Google Sheet where data will be logged
GOOGLE_SHEET_ID="YOUR_EXPENSE_SPREADSHEET_ID"
```

### 4\. Run the Application

```bash
npm start
# or
yarn start
```

The application will be accessible at `http://localhost:3000` (or the port specified in your configuration).

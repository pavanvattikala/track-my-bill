# 🧾 AI Bill Tracker

This is a **mobile-first web application** designed to automatically extract key financial data from uploaded receipts, bills, or invoices using the Perplexity AI `sonar` model with structured JSON output.

Users can upload an image or PDF (or take a photo on mobile) and instantly get extracted data fields like the amount, vendor, date, category, and notes.

## ✨ Features

* **Mobile-Optimized Interface**: Clean, responsive design built with Tailwind CSS for seamless mobile use.
* **Intelligent Data Extraction**: Utilizes the Perplexity API with a JSON schema to ensure accurate, structured output.
* **Multi-Format Support**: Supports common receipt formats including **Images** (JPEG, PNG) and **Documents** (PDF, DOCX, TXT, RTF).
* **Structured Output**: Extracts five key fields:
    * `amount` (The total cost)
    * `vendor` (Short company name)
    * `date` (Date of purchase in YYYY-MM-DD format)
    * `category` (e.g., food, travel, cosmetics)
    * `notes` (A short description)

---

## 🚀 Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites

You must have the following installed:

* **Node.js** (v18 or higher)
* **npm** or **Yarn**
* A **Perplexity API Key** (You can obtain one by signing up on the Perplexity website).

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd ai-bill-tracker
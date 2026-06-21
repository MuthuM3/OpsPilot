/* eslint-disable @typescript-eslint/no-explicit-any */
import { OpenAI } from 'openai';
import { parse } from 'csv-parse/sync';

export interface CsvMappingResult {
  mappings: Record<string, string | null>;
  preview: Array<{
    sku: string;
    name: string;
    price: number;
    inventory: number;
    raw: any;
  }>;
}

export function parseCsv(csvContent: string): { headers: string[]; rows: any[] } {
  try {
    const records = parse(csvContent, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
    });
    
    if (records.length === 0) {
      throw new Error('CSV is empty');
    }
    
    const headers = records[0].map((h: string) => h.trim());
    const rows = records.slice(1);
    
    return { headers, rows };
  } catch (error: any) {
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

export async function getAiColumnMapping(
  headers: string[],
  sampleRows: any[]
): Promise<Record<string, string | null>> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey || apiKey.trim() === '') {
    console.log('No OpenAI API Key found. Using rule-based mock mapping engine.');
    return getMockColumnMapping(headers);
  }
  
  try {
    const openai = new OpenAI({ apiKey });
    
    const prompt = `You are an AI data integration helper. You map headers of arbitrary e-commerce supplier inventory CSVs to our standardized database schema.
Our target schema fields are:
- "sku" (uniquely identifies a product code/SKU)
- "name" (the product name or title/description)
- "price" (unit cost or listing price of the product)
- "inventory" (the current quantity in stock)

Here are the headers of the uploaded CSV:
${JSON.stringify(headers)}

Here are some sample rows from the CSV (values corresponding to the headers):
${JSON.stringify(sampleRows.slice(0, 3))}

Please map each of the uploaded CSV headers to exactly one of our target schema fields ("sku", "name", "price", "inventory"), or null if there is no match.
Return your response as a strict JSON object where the keys are the uploaded CSV headers and the values are the target schema fields or null. Do not include any other text or markdown block formatting.

Example response:
{
  "Item ID": "sku",
  "Product Title": "name",
  "Stock Level": "inventory",
  "MSRP": "price",
  "Supplier Name": null
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0].message.content;
    if (content) {
      const mapping = JSON.parse(content);
      return mapping;
    }
    throw new Error('Empty AI response');
  } catch (error: any) {
    console.error('AI mapping failed, falling back to mock:', error);
    return getMockColumnMapping(headers);
  }
}

export function getMockColumnMapping(headers: string[]): Record<string, string | null> {
  const mappings: Record<string, string | null> = {};
  
  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (/sku|code|id|item.*no|identifier|part.*number/i.test(normalized)) {
      mappings[header] = 'sku';
    } else if (/name|title|desc|item|product/i.test(normalized)) {
      mappings[header] = 'name';
    } else if (/price|cost|rate|value|amount|msrp|buy/i.test(normalized)) {
      mappings[header] = 'price';
    } else if (/qty|quantity|stock|inventory|count|avail/i.test(normalized)) {
      mappings[header] = 'inventory';
    } else {
      mappings[header] = null;
    }
  }
  
  return mappings;
}

export function generatePreview(
  headers: string[],
  rows: any[],
  mappings: Record<string, string | null>
): Array<{ sku: string; name: string; price: number; inventory: number; raw: any }> {
  const skuIdx = headers.findIndex(h => mappings[h] === 'sku');
  const nameIdx = headers.findIndex(h => mappings[h] === 'name');
  const priceIdx = headers.findIndex(h => mappings[h] === 'price');
  const inventoryIdx = headers.findIndex(h => mappings[h] === 'inventory');
  
  const preview: any[] = [];
  
  for (const row of rows) {
    if (!row || row.length === 0) continue;
    
    const sku = skuIdx !== -1 ? String(row[skuIdx] || '').trim() : '';
    const name = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : 'Unnamed Item';
    
    let price = 0;
    if (priceIdx !== -1 && row[priceIdx]) {
      // Strip thousands separators, then grab the first real number. This avoids
      // bugs like "Rs. 899" -> ".899" -> 0.899 (the dot in "Rs." was being kept).
      const cleaned = String(row[priceIdx]).replace(/,/g, '');
      const match = cleaned.match(/\d+(\.\d+)?/);
      price = match ? parseFloat(match[0]) : 0;
    }
    
    let inventory = 0;
    if (inventoryIdx !== -1 && row[inventoryIdx]) {
      const rawInv = String(row[inventoryIdx]).replace(/[^0-9]/g, '');
      inventory = parseInt(rawInv, 10) || 0;
    }
    
    if (sku) {
      preview.push({
        sku,
        name,
        price,
        inventory,
        raw: row
      });
    }
  }
  
  return preview;
}

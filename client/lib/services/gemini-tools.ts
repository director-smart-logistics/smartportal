/**
 * Gemini Function Calling / Tools Integration
 * 
 * Provides tools for Gemini to:
 * - Calculate prices using the pricing service (NOT AI calculations)
 * - Look up customers from Firebase
 * - Validate data against business rules
 * 
 * This ensures pricing logic stays in deterministic functions,
 * not in AI responses.
 */

import { pricingService, calculatePrice } from '../pricing';
import type { Country, ShippingType, ItemCategory, PricingResult } from '../pricing';
import { db } from '../firebase';
import { collection, getDocs, query, limit as firestoreLimit, where } from 'firebase/firestore';
import { detectPermit, detectPermitFromManifestId, detectPermitFromDescription, batchDetectPermits } from './permit-detector';
import { findCustomerMatch, batchFindCustomerMatches, batchFindCustomerMatchesWithAI, type CustomerMatchResponse } from './customer-matcher';

const GEMINI_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

export interface GeminiTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
}

export const AVAILABLE_TOOLS: GeminiTool[] = [
  {
    name: 'calculate_shipping_price',
    description: 'Calculates the shipping price for a package based on weight, country, shipping type, and category. ALWAYS use this instead of calculating prices manually.',
    parameters: {
      type: 'object',
      properties: {
        weight_kg: {
          type: 'number',
          description: 'Package weight in kilograms',
        },
        country: {
          type: 'string',
          description: 'Origin country code',
          enum: ['usa', 'mexico', 'china', 'colombia'],
        },
        shipping_type: {
          type: 'string',
          description: 'Shipping method',
          enum: ['air', 'sea'],
        },
        category: {
          type: 'string',
          description: 'Item category',
          enum: ['regular', 'restricted', 'electronics'],
        },
        requires_permit: {
          type: 'boolean',
          description: 'Whether the item requires a permit (adds $3 surcharge)',
        },
      },
      required: ['weight_kg'],
    },
  },
  {
    name: 'lookup_customer',
    description: 'Looks up a customer by name or slCode in the database to get their information',
    parameters: {
      type: 'object',
      properties: {
        search_term: {
          type: 'string',
          description: 'Customer name or slCode to search for',
        },
        search_type: {
          type: 'string',
          description: 'Type of search',
          enum: ['name', 'slCode'],
        },
      },
      required: ['search_term'],
    },
  },
  {
    name: 'get_pricing_info',
    description: 'Gets pricing information and rules for a specific country and shipping type',
    parameters: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Country code',
          enum: ['usa', 'mexico', 'china', 'colombia'],
        },
        shipping_type: {
          type: 'string',
          description: 'Shipping method',
          enum: ['air', 'sea'],
        },
      },
      required: ['country'],
    },
  },
  {
    name: 'batch_calculate_prices',
    description: 'Calculates prices for multiple packages at once',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Array of items with weight_kg, country, shipping_type, category, requires_permit',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'detect_permit_required',
    description: 'Detects if a manifest or item requires permits. ALWAYS use this to determine if requiresPermit=true. Checks manifest ID for DANP suffix, PERMISOS, PERMIT patterns. Also checks item descriptions for restricted keywords.',
    parameters: {
      type: 'object',
      properties: {
        manifest_id: {
          type: 'string',
          description: 'Manifest number/ID (e.g., "28-02-2026DANP"). DANP suffix means permits required.',
        },
        filename: {
          type: 'string',
          description: 'Manifest filename (e.g., "manifiesto_DANP.xlsx")',
        },
        description: {
          type: 'string',
          description: 'Item description to check for restricted keywords',
        },
      },
      required: [],
    },
  },
  {
    name: 'batch_detect_permits',
    description: 'Batch detect permits for multiple items. Use when processing a manifest with many items.',
    parameters: {
      type: 'object',
      properties: {
        manifest_id: {
          type: 'string',
          description: 'Manifest ID - if contains DANP/PERMISOS, ALL items require permits',
        },
        items: {
          type: 'array',
          description: 'Array of {index, description} objects to check',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'match_customer_slcode',
    description: 'Match a customer name to find their SL code and route. Uses multiple algorithms: exact match, Levenshtein, Jaro-Winkler, N-gram, token-based, and phonetic matching. Returns exact match if score >= 98%, otherwise returns candidates for AI to choose from.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Customer name to search for (will be normalized)',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'batch_match_customers',
    description: 'Batch match multiple customer names to SL codes. Efficient for processing manifests with many rows. Returns exact matches directly, candidates array for uncertain matches.',
    parameters: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          description: 'Array of {index, name} objects to match against customer database',
        },
      },
      required: ['names'],
    },
  },
];

/**
 * Execute a tool call and return the result
 */
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const { name, args } = toolCall;

  switch (name) {
    case 'calculate_shipping_price': {
      const weightKg = Number(args.weight_kg) || 0;
      const country = (args.country as Country) || 'usa';
      const shippingType = (args.shipping_type as ShippingType) || 'air';
      const category = (args.category as ItemCategory) || 'regular';
      const requiresPermit = Boolean(args.requires_permit);

      const result = calculatePrice(weightKg, country, shippingType, category, requiresPermit);
      
      return {
        name,
        result: {
          price: result.price,
          currency: result.currency,
          breakdown: result.breakdown,
          quoteRequired: result.quoteRequired,
        },
      };
    }

    case 'lookup_customer': {
      const searchTerm = String(args.search_term || '').toUpperCase();
      const searchType = args.search_type || 'name';

      try {
        const customersRef = collection(db, 'customers');
        let q;

        if (searchType === 'slCode') {
          q = query(customersRef, where('slCode', '==', searchTerm), firestoreLimit(1));
        } else {
          q = query(customersRef, firestoreLimit(100));
        }

        const snapshot = await getDocs(q);
        const customers: Array<{ id: string; fullName: string; slCode: string; route?: string }> = [];

        snapshot.forEach(docSnap => {
          const data = docSnap.data() as { fullName?: string; firstName?: string; lastName?: string; slCode?: string; ruta?: string; route?: string; status?: string };
          if (data.status === 'deleted') return;
          const fullName = (data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim()).toUpperCase();

          if (searchType === 'name') {
            if (fullName.includes(searchTerm) || searchTerm.includes(fullName)) {
              customers.push({
                id: docSnap.id,
                fullName,
                slCode: data.slCode || '',
                route: data.ruta || data.route || '',
              });
            }
          } else {
            customers.push({
              id: docSnap.id,
              fullName,
              slCode: data.slCode || '',
              route: data.ruta || data.route || '',
            });
          }
        });

        return {
          name,
          result: {
            found: customers.length > 0,
            count: customers.length,
            customers: customers.slice(0, 5),
          },
        };
      } catch (error) {
        return {
          name,
          result: { found: false, error: 'Error searching customers' },
        };
      }
    }

    case 'get_pricing_info': {
      const country = (args.country as Country) || 'usa';
      const shippingType = args.shipping_type as ShippingType | undefined;

      const config = pricingService.getConfig(country);
      if (!config) {
        return {
          name,
          result: { error: `Country ${country} not found` },
        };
      }

      const info: Record<string, unknown> = {
        country: config.name,
        flag: config.flag,
        currency: config.currency,
      };

      if (shippingType && config.shippingTypes[shippingType]) {
        const typeConfig = config.shippingTypes[shippingType];
        info.shippingType = {
          name: typeConfig.name,
          note: typeConfig.note,
          regular: typeConfig.regular.description,
          restricted: typeConfig.restricted.description,
          electronics: typeConfig.electronics.description,
        };
      } else {
        info.shippingTypes = Object.entries(config.shippingTypes).map(([code, type]) => ({
          code,
          name: type.name,
          note: type.note,
        }));
      }

      return { name, result: info };
    }

    case 'batch_calculate_prices': {
      const items = args.items as Array<{
        weight_kg: number;
        country?: string;
        shipping_type?: string;
        category?: string;
        requires_permit?: boolean;
      }>;

      if (!Array.isArray(items)) {
        return { name, result: { error: 'Items must be an array' } };
      }

      const results = items.map((item, index) => {
        const result = calculatePrice(
          Number(item.weight_kg) || 0,
          (item.country as Country) || 'usa',
          (item.shipping_type as ShippingType) || 'air',
          (item.category as ItemCategory) || 'regular',
          Boolean(item.requires_permit)
        );

        return {
          index,
          weight: item.weight_kg,
          price: result.price,
          breakdown: result.breakdown,
        };
      });

      const total = results.reduce((sum, r) => sum + r.price, 0);

      return {
        name,
        result: {
          items: results,
          total: Math.round(total * 100) / 100,
          count: results.length,
        },
      };
    }

    case 'detect_permit_required': {
      const manifestId = String(args.manifest_id || '');
      const filename = String(args.filename || '');
      const description = String(args.description || '');

      const result = detectPermit({
        manifestId: manifestId || undefined,
        filename: filename || undefined,
        description: description || undefined,
      });

      return {
        name,
        result: {
          requiresPermit: result.requiresPermit,
          reason: result.reason,
          confidence: result.confidence,
          detectedPattern: result.detectedPattern,
        },
      };
    }

    case 'batch_detect_permits': {
      const manifestId = String(args.manifest_id || '');
      const items = args.items as Array<{ index: number; description?: string }>;

      if (!Array.isArray(items)) {
        return { name, result: { error: 'Items must be an array' } };
      }

      const resultsMap = batchDetectPermits(items, manifestId || undefined);
      const results: Array<{ index: number; requiresPermit: boolean; reason: string }> = [];

      for (const [index, detection] of resultsMap) {
        results.push({
          index,
          requiresPermit: detection.requiresPermit,
          reason: detection.reason,
        });
      }

      const allRequirePermit = results.every(r => r.requiresPermit);
      const anyRequirePermit = results.some(r => r.requiresPermit);

      return {
        name,
        result: {
          manifestRequiresPermit: manifestId ? detectPermitFromManifestId(manifestId).requiresPermit : false,
          items: results,
          allRequirePermit,
          anyRequirePermit,
          count: results.length,
        },
      };
    }

    case 'match_customer_slcode': {
      const customerName = String(args.name || '');

      if (!customerName.trim()) {
        return { 
          name, 
          result: { 
            error: 'Customer name is required',
            exactMatch: false,
            slCode: undefined,
            ruta: undefined,
          } 
        };
      }

      const matchResult = await findCustomerMatch(customerName);

      return {
        name,
        result: {
          exactMatch: matchResult.exactMatch,
          slCode: matchResult.slCode || undefined,
          ruta: matchResult.ruta || undefined,
          searchedName: matchResult.searchedName,
          bestMatch: matchResult.bestMatch ? {
            name: matchResult.bestMatch.customer.name,
            slCode: matchResult.bestMatch.customer.slCode,
            ruta: matchResult.bestMatch.customer.ruta || undefined,
            score: matchResult.bestMatch.score,
            matchType: matchResult.bestMatch.matchType,
          } : undefined,
          candidates: matchResult.candidates.map(c => ({
            name: c.customer.name,
            slCode: c.customer.slCode,
            ruta: c.customer.ruta || undefined,
            score: c.score,
            matchType: c.matchType,
            algorithms: {
              jaroWinkler: c.algorithms.jaroWinkler,
              levenshtein: c.algorithms.levenshtein,
              tokenBased: c.algorithms.tokenBased,
            },
          })),
          totalCustomers: matchResult.totalCustomers,
        },
      };
    }

    case 'batch_match_customers': {
      const names = args.names as Array<{ index: number; name: string }>;

      if (!Array.isArray(names)) {
        return { name, result: { error: 'Names must be an array' } };
      }

      // Use the hardened AI pipeline (Pass 1: algo, Pass 2: AI, Pass 3: learned)
      const matchResults = await batchFindCustomerMatchesWithAI(names);
      const results: Array<{
        index: number;
        exactMatch: boolean;
        slCode?: string;
        ruta?: string;
        searchedName: string;
        candidates: Array<{
          name: string;
          slCode: string;
          ruta?: string;
          score: number;
        }>;
      }> = [];

      for (const [index, match] of matchResults) {
        results.push({
          index,
          exactMatch: match.exactMatch,
          slCode: match.slCode || undefined,
          ruta: match.ruta || undefined,
          searchedName: match.searchedName,
          candidates: match.candidates.slice(0, 5).map(c => ({
            name: c.customer.name,
            slCode: c.customer.slCode,
            ruta: c.customer.ruta || undefined,
            score: c.score,
          })),
        });
      }

      const exactMatches = results.filter(r => r.exactMatch).length;
      const needsReview = results.filter(r => !r.exactMatch && r.candidates.length > 0).length;
      const noMatches = results.filter(r => !r.exactMatch && r.candidates.length === 0).length;

      return {
        name,
        result: {
          items: results,
          summary: {
            total: results.length,
            exactMatches,
            needsReview,
            noMatches,
          },
        },
      };
    }

    default:
      return {
        name,
        result: { error: `Unknown tool: ${name}` },
      };
  }
}

/**
 * Convert tools to Gemini API format
 */
export function getGeminiToolsConfig() {
  return {
    tools: [{
      functionDeclarations: AVAILABLE_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    }],
    toolConfig: {
      functionCallingConfig: {
        mode: 'AUTO',
      },
    },
  };
}

/**
 * Call Gemini with function calling enabled
 */
export async function callGeminiWithTools(
  prompt: string,
  systemInstruction?: string
): Promise<{ text: string; toolCalls: ToolResult[] }> {
  const toolsConfig = getGeminiToolsConfig();
  
  const requestBody: Record<string, unknown> = {
    contents: [{
      parts: [{ text: prompt }],
    }],
    ...toolsConfig,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    
    if (!candidate) {
      return { text: '', toolCalls: [] };
    }

    const parts = candidate.content?.parts || [];
    const toolCalls: ToolResult[] = [];
    let textResponse = '';

    for (const part of parts) {
      if (part.text) {
        textResponse += part.text;
      }
      
      if (part.functionCall) {
        const toolCall: ToolCall = {
          name: part.functionCall.name,
          args: part.functionCall.args || {},
        };
        
        const result = await executeTool(toolCall);
        toolCalls.push(result);
      }
    }

    return { text: textResponse, toolCalls };
  } catch (error) {
    console.error('Gemini API error:', error);
    return { text: '', toolCalls: [] };
  }
}


const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// =====================================
// TYPES
// =====================================

export interface ShoppingItem {
  id: number;
  shopping_list_id: number;
  name: string;
  quantity: number;
  completed: boolean;
}

export interface ShoppingList {
  id: number;
  source_scan_id?: number | null;
  is_mock?: boolean;
  name: string;
  items: ShoppingItem[];
}

export interface FridgeScan {
  id: number;
  is_mock: boolean;
  model_used: string | null;
  status: string;
  created_at?: string;
}

export type StockStatus = "low" | "available" | "unknown";

export interface DetectedItem {
  id: number;
  scan_id: number;
  name: string;
  stock_status: StockStatus;
  confirmed: boolean;
}

export interface ItemCreate {
  name: string;
  stock_status?: StockStatus;
  confirmed?: boolean;
}

export interface ItemUpdate {
  name?: string;
  stock_status?: StockStatus;
  confirmed?: boolean;
}

export interface ApiHealth {
  status: string;
  database: string;
  ai: string;
  mock_vision: boolean;
}

// =====================================
// REQUEST HELPER
// =====================================

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `${API_URL}${endpoint}`,
    {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const body: unknown = await response.json();

      if (
        typeof body === "object" &&
        body !== null &&
        "detail" in body
      ) {
        const detail = (
          body as { detail: unknown }
        ).detail;

        if (typeof detail === "string") {
          message = detail;
        } else if (Array.isArray(detail)) {
          message = JSON.stringify(detail);
        }
      }
    } catch {
      // Use the HTTP status message.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

// =====================================
// API METHODS
// =====================================

export interface AIRecognizedItem {
  name: string;
  stock_status: "low" | "available" | "unknown";
}

export interface AIAnalysisResponse {
  model_used: string;
  is_mock: boolean;
  items: AIRecognizedItem[];
}

export async function analyzeFridgePhotos(
  photos: File[],
  consent: boolean
): Promise<AIAnalysisResponse> {
  const form = new FormData();

  photos.forEach((photo) => {
    form.append("photos", photo);
  });

  form.append("consent", String(consent));

  let response: Response;

  try {
    response = await fetch(
      `${API_URL}/api/scans/analyze`,
      {
        method: "POST",
        body: form
      }
    );
  } catch {
    throw new Error(
      "Cannot reach the backend. Check your FastAPI server."
    );
  }

  if (!response.ok) {
    let message = "Image analysis failed";

    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Keep the default message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<AIAnalysisResponse>;
}

export const api = {
  // -----------------------------------
  // HEALTH CHECK
  // -----------------------------------

  health: () =>
    request<ApiHealth>("/api/health"),

  // -----------------------------------
  // SHOPPING LIST CRUD
  // -----------------------------------

  getLists: () =>
    request<ShoppingList[]>("/api/shopping-lists"),

  getList: (listId: number) =>
    request<ShoppingList>(
      `/api/shopping-lists/${listId}`
    ),

  createList: (name: string) =>
    request<ShoppingList>(
      "/api/shopping-lists",
      {
        method: "POST",
        body: JSON.stringify({ name }),
      }
    ),

  renameList: (listId: number, name: string) =>
    request<ShoppingList>(
      `/api/shopping-lists/${listId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }
    ),

  deleteList: (listId: number) =>
    request<void>(
      `/api/shopping-lists/${listId}`,
      {
        method: "DELETE",
      }
    ),

  // -----------------------------------
  // SHOPPING ITEM CRUD
  // -----------------------------------

  addItem: (
    listId: number,
    name: string,
    quantity: number = 1
  ) =>
    request<ShoppingItem>(
      `/api/shopping-lists/${listId}/items`,
      {
        method: "POST",
        body: JSON.stringify({
          name,
          quantity,
        }),
      }
    ),

  updateItem: (
    itemId: number,
    data: Partial<
      Pick<
        ShoppingItem,
        "name" | "quantity" | "completed"
      >
    >
  ) =>
    request<ShoppingItem>(
      `/api/shopping-list-items/${itemId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  deleteItem: (itemId: number) =>
    request<void>(
      `/api/shopping-list-items/${itemId}`,
      {
        method: "DELETE",
      }
    ),

  // -----------------------------------
  // FRIDGE SCANS
  // -----------------------------------

  createScan: (metadata?: { is_mock: boolean; model_used: string | null }) =>
    request<FridgeScan>(
      "/api/scans",
      {
        method: "POST",
        body: metadata ? JSON.stringify(metadata) : undefined,
      }
    ),

  saveReview: (scanId: number, items: (ItemCreate & { id?: number; confirmed: true })[]) =>
    request<DetectedItem[]>(`/api/scans/${scanId}/review`, {
      method: "PUT",
      body: JSON.stringify({ items }),
    }),

  getScans: () =>
    request<FridgeScan[]>("/api/scans"),

  getScanItems: (scanId: number) =>
    request<DetectedItem[]>(
      `/api/scans/${scanId}/items`
    ),

  // -----------------------------------
  // DETECTED FRIDGE ITEMS
  // -----------------------------------

  addDetectedItem: (
    scanId: number,
    data: ItemCreate
  ) =>
    request<DetectedItem>(
      `/api/scans/${scanId}/items`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  updateDetectedItem: (
    itemId: number,
    data: ItemUpdate
  ) =>
    request<DetectedItem>(
      `/api/items/${itemId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    ),

  deleteDetectedItem: (itemId: number) =>
    request<void>(
      `/api/items/${itemId}`,
      {
        method: "DELETE",
      }
    ),

  // -----------------------------------
  // SAVE LOW-STOCK ITEMS
  // -----------------------------------

  saveScanToList: (scanId: number) =>
    request<ShoppingList>(
      `/api/scans/${scanId}/save-to-list`,
      {
        method: "POST",
      }
    ),
};
